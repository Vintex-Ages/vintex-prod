"""O que a rodada de avaliação decide com a rota e o provedor simulados
(back-end#326): o acerto de cada pergunta, o perfil, a cota que acaba no meio
e a rodada usada como base da comparação."""

import json
import urllib.error
from decimal import Decimal

import pytest

import scripts.avaliar_ia as avaliar

_LEITURA = {
    "type": "interpreted",
    "filters": {"category": "Sapatos"},
    "similarity": None,
    "tipo": "Bota",
    "in_scope": True,
}
_CASO = {"pergunta": "bota preta", "esperado": {"tipo": ["Bota"]}}


def _peca(**campos):
    base = {
        "id": 1,
        "name": "Coturno tratorado de couro Democrata",
        "tipo": "Bota",
        "category": "Sapatos",
        "color": "Preto",
        "size": "40",
        "brand": "Democrata",
        "style": "gotico-dark",
        "price": Decimal("533.90"),
        "store": "Ateliê Reviver",
    }
    return {**base, **campos}


def _catalogo():
    return {
        1: _peca(id=1),
        2: _peca(id=2, tipo="Sandália", name="Rasteira", price=Decimal("90")),
    }


def _rota(monkeypatch, *eventos, falha=None):
    def perguntar(api, texto):
        if falha is not None:
            raise falha
        return list(eventos), 0.1

    monkeypatch.setattr(avaliar, "perguntar", perguntar)


def _produtos(*ids, match_type="exact"):
    return {
        "type": "products",
        "match_type": match_type,
        "products": [
            {
                "id": i,
                "name": "Coturno tratorado de couro Democrata",
                "price": 533.9,
                "store": {"name": "Ateliê Reviver"},
            }
            for i in ids
        ],
    }


# --- conversa -----------------------------------------------------------------


def test_caso_de_catalogo_acerta_com_a_pergunta_lida(monkeypatch):
    _rota(monkeypatch, _LEITURA, _produtos(1), {"type": "done"})
    linha = avaliar.rodar_caso("http://api", "catalogo", _CASO, _catalogo())

    assert linha["acerto"] is True
    assert linha["sem_leitura"] is False
    assert linha["esperadas"] == [1]
    assert linha["ao_acaso"] == 1.0  # duas peças no catálogo: o caso não discrimina
    assert linha["fora_do_catalogo"] == []


def test_caso_de_catalogo_sem_leitura_nao_e_acerto(monkeypatch):
    """Sem o evento `interpreted`, a busca foi só por similaridade."""
    _rota(monkeypatch, _produtos(1), {"type": "done"})
    linha = avaliar.rodar_caso("http://api", "catalogo", _CASO, _catalogo())

    assert linha["sem_leitura"] is True
    assert linha["acerto"] is False


def test_corte_de_preco_precisa_do_filtro_lido(monkeypatch):
    """A peça cabe no teto, mas o preço não foi lido: o filtro não cortou."""
    caso = {
        "pergunta": "bota até 600",
        "esperado": {"tipo": ["Bota"]},
        "corte": {"preco_max": 600},
    }
    _rota(monkeypatch, _LEITURA, _produtos(1), {"type": "done"})
    sem_filtro = avaliar.rodar_caso("http://api", "catalogo", caso, _catalogo())

    leitura = {**_LEITURA, "filters": {"category": "Sapatos", "price_max": 600}}
    _rota(monkeypatch, leitura, _produtos(1), {"type": "done"})
    com_filtro = avaliar.rodar_caso("http://api", "catalogo", caso, _catalogo())

    assert sem_filtro["corte_respeitado"] is True
    assert sem_filtro["corte_lido"] is False
    assert sem_filtro["acerto"] is False
    assert com_filtro["acerto"] is True


def test_nao_temos_acerta_com_alternativa_e_aviso(monkeypatch):
    caso = {"pergunta": "vestido", "ausente": {"tipo": ["Vestido"]}}
    _rota(
        monkeypatch,
        _LEITURA,
        {"type": "text", "delta": "Não encontrei vestido no catálogo."},
        _produtos(1, match_type="fallback"),
        {"type": "done"},
    )
    certo = avaliar.rodar_caso("http://api", "nao_temos", caso, _catalogo())

    _rota(monkeypatch, _LEITURA, _produtos(1), {"type": "done"})
    errado = avaliar.rodar_caso("http://api", "nao_temos", caso, _catalogo())

    assert certo["acerto"] is True
    assert errado["acerto"] is False


def test_cota_esgotada_para_a_rodada(monkeypatch):
    _rota(
        monkeypatch,
        {
            "type": "error",
            "code": "quota_exceeded",
            "message": "Você atingiu o limite",
            "retry_at": "2026-11-13T00:00:00Z",
        },
        {"type": "done"},
    )
    with pytest.raises(avaliar.CotaAcabou) as cota:
        avaliar.rodar_caso("http://api", "catalogo", _CASO, _catalogo())
    assert "cota esgotada" in cota.value.args[0]["invalido"]


def test_falha_de_rede_sai_da_conta(monkeypatch):
    _rota(monkeypatch, falha=urllib.error.URLError("connection refused"))
    linha = avaliar.rodar_caso("http://api", "catalogo", _CASO, _catalogo())

    assert "falha ao chamar a API" in linha["invalido"]
    assert "acerto" not in linha


# --- perfis --------------------------------------------------------------------


def test_perfil_conta_os_k_primeiros_dentro_dos_estilos(monkeypatch):
    catalogo = {
        1: _peca(id=1, style="gotico-dark"),
        2: _peca(id=2, style="gotico-dark", name="Rasteira", price=Decimal("90")),
        3: _peca(id=3, style="y2k", name="Bolsa", price=Decimal("50")),
    }
    devolvidas = [
        {
            "id": i,
            "name": catalogo[i]["name"],
            "price": catalogo[i]["price"],
            "store_name": "Ateliê Reviver",
        }
        for i in (1, 3, 2)
    ]

    class Repositorio:
        def __init__(self, db):
            pass

        def find_similar(self, vetor, modelo, pagina):
            return devolvidas, len(devolvidas)

    monkeypatch.setattr(avaliar, "vetor_do_perfil", lambda texto: ([0.0], "m"))
    monkeypatch.setattr(avaliar, "ProductRepository", Repositorio)
    linha = avaliar.rodar_perfil(None, {"estilos": ["gotico-dark"]}, catalogo)

    # Duas peças ativas no estilo, então k = 2; das duas primeiras, uma é dele.
    assert (linha["k"], linha["dentro_dos_estilos"], linha["taxa"]) == (2, 1, 0.5)
    assert linha["acerto"] is False
    assert linha["fora_do_catalogo"] == []


def test_perfil_com_falha_do_provedor_sai_da_conta(monkeypatch):
    def falha(texto):
        raise avaliar.AIProviderError("503")

    monkeypatch.setattr(avaliar, "vetor_do_perfil", falha)
    linha = avaliar.rodar_perfil(None, {"estilos": ["y2k"]}, {})

    assert "invalido" in linha


# --- comparação entre rodadas ----------------------------------------------------


def _gravar(pasta, nome, conjunto, hash_, completa, acerto):
    caminho = pasta / nome
    caminho.write_text(
        json.dumps(
            {
                "quando": nome,
                "completa": completa,
                "conjuntos": {
                    conjunto: {
                        "hash": hash_,
                        "casos": [{"pergunta": "bota preta", "acerto": acerto}],
                    }
                },
            }
        ),
        encoding="utf-8",
    )
    return caminho


def test_base_e_a_ultima_completa_com_o_mesmo_conjunto(monkeypatch, tmp_path, capsys):
    monkeypatch.setattr(avaliar, "RODADAS", tmp_path)
    _gravar(tmp_path, "a.json", "catalogo", "h1", True, False)
    _gravar(tmp_path, "b.json", "catalogo", "h2", True, True)  # outro esperado
    _gravar(tmp_path, "c.json", "catalogo", "h1", False, True)  # incompleta
    _gravar(tmp_path, "d.json", "fotos", "h1", True, True)  # outro conjunto
    atual = _gravar(tmp_path, "e.json", "catalogo", "h1", True, True)

    anterior = avaliar.anterior_do_conjunto("catalogo", "h1", atual)
    assert anterior is not None
    assert anterior["quando"] == "a.json"

    avaliar.mostrar_diferenca(
        "catalogo", anterior, json.loads(atual.read_text(encoding="utf-8"))
    )
    assert "bota preta: acerto: False -> True" in capsys.readouterr().out


def test_sem_base_a_diferenca_diz_que_nao_tem(monkeypatch, tmp_path, capsys):
    monkeypatch.setattr(avaliar, "RODADAS", tmp_path)
    atual = _gravar(tmp_path, "e.json", "catalogo", "h1", True, True)

    assert avaliar.anterior_do_conjunto("catalogo", "h1", atual) is None
    avaliar.mostrar_diferenca("catalogo", None, {})
    assert "sem rodada completa anterior" in capsys.readouterr().out


# --- cota ----------------------------------------------------------------------


def test_cota_compara_o_que_resta_no_dia(monkeypatch):
    """Duas rodadas no mesmo dia somam: o limite cabe, o que resta não."""
    from app.services.chat_quota import CHAVE_DO_PROJETO

    usado = {CHAVE_DO_PROJETO: 30, "ip:127.0.0.1": 30}

    class Uso:
        def __init__(self, db):
            pass

        def contagem(self, dia, chave):
            return usado.get(chave, 0)

    monkeypatch.setattr(avaliar, "AIChatUsageRepository", Uso)
    monkeypatch.setattr(avaliar.settings, "CHAT_QUOTA_PER_PERSON", 50)
    monkeypatch.setattr(avaliar.settings, "CHAT_QUOTA_PER_DAY", 50)

    falta = avaliar.cota_que_falta(None, "http://127.0.0.1:8000", 37)
    assert falta is not None
    assert "restam 20" in falta
    assert avaliar.cota_que_falta(None, "http://127.0.0.1:8000", 20) is None
