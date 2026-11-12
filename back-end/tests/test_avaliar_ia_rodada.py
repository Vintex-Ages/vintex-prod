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

    leitura = {**_LEITURA, "filters": {"category": "Sapatos", "price_max": 50}}
    _rota(monkeypatch, leitura, _produtos(1), {"type": "done"})
    outro_teto = avaliar.rodar_caso("http://api", "catalogo", caso, _catalogo())

    assert sem_filtro["corte_respeitado"] is True
    assert sem_filtro["corte_lido"] is False
    assert sem_filtro["acerto"] is False
    assert com_filtro["acerto"] is True
    # "até 600" lido como 50 também respeita o teto, mas não é o pedido.
    assert outro_teto["corte_lido"] is False


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
    assert linha["falha"] is True
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
    assert linha["falha"] is True


# --- fotos ---------------------------------------------------------------------


def test_foto_com_falha_do_provedor_sai_da_conta():
    """Um 429 nas fotos não é a IA errando: não entra na meta da história."""

    class Falso:
        def analyze_image_bytes(self, images):
            raise avaliar.AIProviderError("429 RESOURCE_EXHAUSTED")

    caso = {
        "foto": "back-end/scripts/avaliacao/fotos/instrucao-camisa-chanel.jpg",
        "esperado": {"category": "Roupas", "color": "Branco"},
    }
    linha = avaliar.rodar_foto(Falso(), caso)

    assert linha["falha"] is True
    assert avaliar.resumo_da_historia([linha])["fotos"] == 0
    assert avaliar.resumo_dos_campos([linha])["avaliados"] == 0
    assert avaliar.resumo([linha])["validos"] == 0


def test_caso_que_quebra_o_script_sai_da_conta():
    def quebra():
        raise TypeError("preço None")

    linha = avaliar._seguro({"pergunta": "bota"}, quebra)
    assert linha["pergunta"] == "bota"
    assert linha["falha"] is True
    assert "TypeError" in linha["invalido"]


def test_cota_que_acaba_atravessa_o_seguro():
    def acaba():
        raise avaliar.CotaAcabou({"pergunta": "bota"})

    with pytest.raises(avaliar.CotaAcabou):
        avaliar._seguro({"pergunta": "bota"}, acaba)


# --- comparação entre rodadas ----------------------------------------------------


def _gravar(pasta, nome, conjunto, hash_, completo, acerto, taxa=None):
    caminho = pasta / nome
    caso = {"pergunta": "bota preta", "acerto": acerto}
    if acerto is None:
        caso = {"pergunta": "bota preta", "invalido": "rede", "falha": True}
    caminho.write_text(
        json.dumps(
            {
                "quando": nome,
                "conjuntos": {
                    conjunto: {
                        "hash": hash_,
                        "completo": completo,
                        "resumo": {"taxa": taxa},
                        "casos": [caso],
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
    _gravar(tmp_path, "c.json", "catalogo", "h1", False, True)  # incompleto
    _gravar(tmp_path, "d.json", "fotos", "h1", True, True)  # outro conjunto
    atual = _gravar(tmp_path, "e.json", "catalogo", "h1", True, True)

    anterior = avaliar.anterior_do_conjunto("catalogo", "h1", atual)
    assert anterior is not None
    assert anterior["quando"] == "a.json"

    avaliar.mostrar_diferenca(
        "catalogo", anterior, json.loads(atual.read_text(encoding="utf-8"))
    )
    assert "bota preta: acerto: False -> True" in capsys.readouterr().out


def test_rodada_cortada_nao_derruba_a_comparacao(monkeypatch, tmp_path, capsys):
    monkeypatch.setattr(avaliar, "RODADAS", tmp_path)
    _gravar(tmp_path, "a.json", "catalogo", "h1", True, False)
    (tmp_path / "b.json").write_text('{"quando": "b', encoding="utf-8")
    atual = _gravar(tmp_path, "c.json", "catalogo", "h1", True, True)

    anterior = avaliar.anterior_do_conjunto("catalogo", "h1", atual)
    assert anterior is not None
    assert anterior["quando"] == "a.json"
    assert "b.json ilegível" in capsys.readouterr().out


def test_diferenca_mostra_caso_que_virou_invalido(monkeypatch, tmp_path, capsys):
    antes = _gravar(tmp_path, "a.json", "catalogo", "h1", True, True, taxa=1.0)
    depois = _gravar(tmp_path, "b.json", "catalogo", "h1", True, None, taxa=None)

    avaliar.mostrar_diferenca(
        "catalogo",
        json.loads(antes.read_text(encoding="utf-8")),
        json.loads(depois.read_text(encoding="utf-8")),
    )
    saida = capsys.readouterr().out
    assert "taxa: 1.0 -> None" in saida
    assert "bota preta: invalido: None -> rede" in saida
    assert "nada mudou" not in saida


def test_diferenca_diz_quantas_leituras_cairam(capsys):
    def rodada(taxa, caidas):
        return {
            "quando": "q",
            "conjuntos": {
                "catalogo": {
                    "resumo": {"taxa": taxa, "sem_leitura": caidas},
                    "casos": [],
                }
            },
        }

    avaliar.mostrar_diferenca("catalogo", rodada(0.84, 4), rodada(0.24, 19))
    assert "taxa: 0.84 -> 0.24 (sem leitura: 4 -> 19)" in capsys.readouterr().out


def test_diferenca_mostra_a_taxa_do_perfil(capsys):
    def rodada(taxa):
        return {
            "quando": "q",
            "conjuntos": {
                "perfis": {
                    "resumo": {"taxa": 0.12},
                    "casos": [{"estilos": ["y2k"], "taxa": taxa, "acerto": False}],
                }
            },
        }

    avaliar.mostrar_diferenca("perfis", rodada(0.29), rodada(0.79))
    assert "y2k: taxa: 0.29 -> 0.79" in capsys.readouterr().out


def test_gravar_nao_deixa_o_temporario(monkeypatch, tmp_path):
    monkeypatch.setattr(avaliar, "RODADAS", tmp_path)
    destino = tmp_path / "r.json"
    avaliar.gravar({"quando": "q"}, destino)
    avaliar.gravar({"quando": "q2"}, destino)

    assert json.loads(destino.read_text(encoding="utf-8")) == {"quando": "q2"}
    assert [c.name for c in tmp_path.iterdir()] == ["r.json"]


def test_sem_base_a_diferenca_diz_que_nao_tem(monkeypatch, tmp_path, capsys):
    monkeypatch.setattr(avaliar, "RODADAS", tmp_path)
    atual = _gravar(tmp_path, "e.json", "catalogo", "h1", True, True)

    assert avaliar.anterior_do_conjunto("catalogo", "h1", atual) is None
    avaliar.mostrar_diferenca("catalogo", None, {})
    assert "sem rodada completa anterior" in capsys.readouterr().out


def test_hash_e_dos_casos_e_nao_da_ordem_das_chaves():
    um = avaliar.hash_do_conjunto([{"estilos": ["y2k"], "nota": "a"}])
    mesma = avaliar.hash_do_conjunto([{"nota": "a", "estilos": ["y2k"]}])
    outro = avaliar.hash_do_conjunto([{"estilos": ["boho"], "nota": "a"}])

    assert um == mesma
    assert outro != um


def test_conjunto_completo():
    assert avaliar.completo([{"acerto": True}, {"invalido": "catálogo"}], 2)
    assert not avaliar.completo([{"acerto": True}], 2)  # parou no meio
    assert not avaliar.completo([{"acerto": True}, {"falha": True}], 2)


# --- cota ----------------------------------------------------------------------


def _cota(monkeypatch, projeto, visitante):
    from app.services.chat_quota import CHAVE_DO_PROJETO

    class Uso:
        def __init__(self, db):
            pass

        def contagem(self, dia, chave):
            return projeto if chave == CHAVE_DO_PROJETO else 0

    monkeypatch.setattr(avaliar, "AIChatUsageRepository", Uso)
    monkeypatch.setattr(avaliar, "maior_uso_de_visitante", lambda db, dia: visitante)
    monkeypatch.setattr(avaliar.settings, "CHAT_QUOTA_PER_PERSON", 50)
    monkeypatch.setattr(avaliar.settings, "CHAT_QUOTA_PER_DAY", 60)


def test_cota_compara_o_que_resta_no_dia(monkeypatch):
    """Duas rodadas no mesmo dia somam: o limite cabe, o que resta não."""
    _cota(monkeypatch, projeto=10, visitante=30)  # pessoa resta 20, projeto 50

    falta = avaliar.cota_que_falta(None, 37)
    assert falta is not None
    assert "restam 20 para a origem" in falta
    assert avaliar.cota_que_falta(None, 20) is None


def test_cota_do_projeto_tambem_trava(monkeypatch):
    _cota(monkeypatch, projeto=45, visitante=0)  # pessoa resta 50, projeto 15

    falta = avaliar.cota_que_falta(None, 20)
    assert falta is not None
    assert "15 para o projeto" in falta
    assert avaliar.cota_que_falta(None, 15) is None


def test_maior_uso_de_visitante_le_o_banco(db_session):
    from datetime import date

    from app.models.ai_chat_usage import AIChatUsage

    dia = date(2026, 11, 12)
    db_session.add_all(
        [
            AIChatUsage(day=dia, key="ip:127.0.0.1", count=3),
            AIChatUsage(day=dia, key="ip:172.18.0.1", count=40),
            AIChatUsage(day=dia, key="user:7", count=90),
            AIChatUsage(day=date(2026, 11, 11), key="ip:10.0.0.1", count=99),
        ]
    )
    db_session.flush()

    assert avaliar.maior_uso_de_visitante(db_session, dia) == 40


# --- a rodada inteira ------------------------------------------------------------


class _Banco:
    def close(self):
        pass


def _rodar_main(monkeypatch, tmp_path, *argumentos):
    monkeypatch.setattr(avaliar, "RODADAS", tmp_path)
    monkeypatch.setattr(avaliar, "SessionLocal", _Banco)
    monkeypatch.setattr(avaliar, "cota_que_falta", lambda db, perguntas: None)
    monkeypatch.setattr(avaliar, "catalogo_ativo", lambda db: _catalogo())
    monkeypatch.setattr(avaliar, "procedencia", lambda: {})
    monkeypatch.setattr("sys.argv", ["avaliar_ia", "--nota", "teste", *argumentos])
    codigo = avaliar.main()
    (arquivo,) = tmp_path.glob("*.json")
    return codigo, json.loads(arquivo.read_text(encoding="utf-8"))


def test_api_fora_do_ar_deixa_a_rodada_incompleta(monkeypatch, tmp_path):
    _rota(monkeypatch, falha=urllib.error.URLError("connection refused"))
    codigo, rodada = _rodar_main(monkeypatch, tmp_path, "--so", "instrucao")

    assert codigo == 2
    assert rodada["completa"] is False
    assert rodada["conjuntos"]["instrucao"]["completo"] is False


def test_cota_no_meio_pula_o_resto_da_conversa(monkeypatch, tmp_path):
    _rota(
        monkeypatch,
        {"type": "error", "code": "quota_exceeded", "message": "limite"},
        {"type": "done"},
    )
    codigo, rodada = _rodar_main(
        monkeypatch, tmp_path, "--so", "instrucao", "--so", "nao_temos"
    )

    assert codigo == 2
    assert list(rodada["conjuntos"]) == ["instrucao"]
    assert len(rodada["conjuntos"]["instrucao"]["casos"]) == 1
    assert rodada["completa"] is False


def test_rodada_sem_falha_e_completa(monkeypatch, tmp_path):
    _rota(monkeypatch, _LEITURA, _produtos(1), {"type": "done"})
    codigo, rodada = _rodar_main(monkeypatch, tmp_path, "--so", "instrucao")

    assert codigo == 0
    assert rodada["completa"] is True
    assert rodada["conjuntos"]["instrucao"]["completo"] is True
