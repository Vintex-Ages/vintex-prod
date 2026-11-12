"""Pergunta fora do escopo e tipo de peça na conversa (back-end#231).

A categoria tem três valores, então "vestido" num catálogo sem vestido voltava
com calças marcadas como resultado direto, e "geladeira 400 litros" voltava com
cinco roupas do mesmo jeito. A leitura da pergunta passa a dizer o tipo pedido e
se a pergunta é sobre o que a Vintex vende; nenhum dos dois vira filtro, os dois
só mudam o rótulo e o aviso. Os testes de rota rodam contra Postgres, como os
da #260.
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.constants.catalog import TIPOS_DE_PECA, nome_e_do_tipo
from app.controllers.assistant_controller import (
    _FORA_DO_ESCOPO,
    _aviso_de_alternativas,
)
from app.schemas.product_schema import ProductFilters
from app.seeds.pecas import MODELOS
from app.services.ai.base import AIProviderUnavailableError, InterpretedQuery
from app.services.ai.search_interpretation import (
    InterpretacaoDaPergunta,
    interpretacao_da_resposta,
)
from tests.test_chat_filtros import (
    _ids,
    _loja,
    _peca,
    _perguntar,
    _Provedor,
    _usar,
    _vetor,
)

# --- vocabulário ------------------------------------------------------------


@pytest.mark.parametrize(
    ("nome", "tipo"),
    [
        ("Rasteira de couro trançado Arezzo", "Sandália"),
        ("Coturno tratorado de couro Democrata", "Bota"),
        ("Baby look cropped estampada Colcci", "Camiseta"),
        ("Óculos de sol oval retrô Zara", "Óculos de sol"),
        ("CALÇA cargo larga", "Calça"),
    ],
)
def test_nome_e_do_tipo_pelo_sinonimo_e_sem_acento(nome: str, tipo: str) -> None:
    assert nome_e_do_tipo(nome, tipo)


@pytest.mark.parametrize(
    ("nome", "tipo"),
    [
        ("Camiseta de banda anos 90", "Camisa"),
        ("Calçado de couro", "Calça"),
        ("Sapatênis branco", "Tênis"),
        ("Vestido midi com cinto", "Bota"),
        ("Bolsa de palha", "Tipo que não existe"),
    ],
)
def test_palavra_conta_inteira(nome: str, tipo: str) -> None:
    assert not nome_e_do_tipo(nome, tipo)


@pytest.mark.parametrize(
    ("nome", "tipo"),
    [
        ("Botas de couro cano alto", "Bota"),
        ("Botinha de camurça", "Bota"),
        ("Bolsinha baguete", "Bolsa"),
        ("Brincos de argola dourados", "Bijuteria"),
        ("Anéis de prata", "Bijuteria"),
        ("Vestidinho floral", "Vestido"),
        ("Mocassins de couro", "Mocassim"),
        ("Bonés de aba reta", "Boné"),
        ("Bonézinho infantil", "Boné"),
        ("Vestidão longo com cinto", "Vestido"),
        ("Casaquinho de moletom", "Casaco"),
        ("Sandalinha de couro", "Sandália"),
        ("Scarpins nude", "Scarpin"),
        ("Moleton cinza", "Moletom"),
        ("Babylook branca", "Camiseta"),
        ("Botina de couro", "Bota"),
    ],
)
def test_nome_e_do_tipo_no_plural_no_diminutivo_e_no_aumentativo(
    nome: str, tipo: str
) -> None:
    """O nome é texto livre do vendedor; antes, "Botas" com botas na tela dava
    "Não encontrei bota"."""
    assert nome_e_do_tipo(nome, tipo)


@pytest.mark.parametrize(
    ("nome", "tipo"),
    [
        ("Camisa de botão", "Bota"),
        ("Botões dourados", "Bota"),
        ("Calcinha de renda", "Calça"),
        ("Cinta modeladora", "Cinto"),
        ("Calça cargo com bolsos", "Bolsa"),
        ("Vestidão com bolsos", "Bolsa"),
        ("Nike Air Force 1", "Tênis"),
        ("Bolsa em bom estado", "Boné"),
        ("Camisa com botãozinho", "Bota"),
        ("Calça com bolsozinho", "Bolsa"),
    ],
)
def test_raiz_nao_inventa_tipo(nome: str, tipo: str) -> None:
    """Palavra que a raiz confundiria fica de fora, e nome que só diz o modelo
    não é de tipo nenhum."""
    assert not nome_e_do_tipo(nome, tipo)


# O seed separa calça jeans de calça; para a conversa, calça jeans é calça.
_TIPO_DO_SEED = {"Calça jeans": "Calça"}


@pytest.mark.parametrize("modelo", MODELOS, ids=lambda m: m.nome)
def test_todo_modelo_do_seed_e_do_proprio_tipo(modelo) -> None:  # noqa: ANN001
    """Se o seed ganhar um modelo cujo nome não diz o tipo, a conversa marcaria
    a peça como alternativa para quem pediu exatamente ela."""
    tipo = _TIPO_DO_SEED.get(modelo.tipo, modelo.tipo)
    assert tipo in TIPOS_DE_PECA
    assert nome_e_do_tipo(modelo.nome, tipo)


# --- leitura da pergunta ----------------------------------------------------


def test_tipo_da_lista_vem_como_o_vocabulario_grava() -> None:
    lida = interpretacao_da_resposta(InterpretacaoDaPergunta(tipo="sandalia"))

    assert lida.tipo == "Sandália"
    assert lida.filters == {}


def test_tipo_fora_da_lista_vira_nulo() -> None:
    """Valor livre não pode conferir nada: "roupa" ou "look" marcariam tudo
    como alternativa."""
    lida = interpretacao_da_resposta(InterpretacaoDaPergunta(tipo="roupa"))

    assert lida.tipo is None


@pytest.mark.parametrize("escopo", [True, False, None])
def test_escopo_passa_como_o_modelo_disse(escopo: bool | None) -> None:
    lida = interpretacao_da_resposta(InterpretacaoDaPergunta(in_scope=escopo))

    assert lida.in_scope is escopo


# --- aviso ------------------------------------------------------------------


def test_aviso_com_tipo_troca_a_categoria_pelo_tipo() -> None:
    aviso = _aviso_de_alternativas(
        ProductFilters(category="Sapatos", size="42"), tipo="Tênis"
    )

    assert aviso.startswith("Não encontrei tênis com tamanho 42.")


def test_aviso_so_com_tipo() -> None:
    aviso = _aviso_de_alternativas(ProductFilters(category="Roupas"), tipo="Vestido")

    assert aviso.startswith("Não encontrei vestido no catálogo.")


def test_aviso_sem_filtro_nem_tipo_nao_quebra() -> None:
    """Critério da #231. Antes, `pedidos[0]` levantava IndexError."""
    aviso = _aviso_de_alternativas(ProductFilters())

    assert aviso.startswith("Não encontrei o que você pediu.")


# --- rota -------------------------------------------------------------------


@pytest.mark.postgres
def test_fora_do_escopo_vira_alternativa_sem_filtro(
    pg_client: TestClient, pg_session: Session, monkeypatch
) -> None:
    """Com "geladeira brastemp" a marca não pode cortar nada, e o aviso diz o
    que a Vintex vende, não que faltou a marca."""
    loja = _loja(pg_session)
    jaqueta = _peca(pg_session, loja, "Jaqueta de couro", _vetor(1), category="Roupas")
    pg_session.commit()
    _usar(
        monkeypatch,
        _Provedor(
            InterpretedQuery(
                filters={"brand": "Brastemp"},
                similarity="400 litros",
                in_scope=False,
            ),
            _vetor(1),
        ),
    )

    eventos = _perguntar(pg_client, "geladeira brastemp 400 litros")

    assert [e["type"] for e in eventos] == ["interpreted", "text", "products", "done"]
    # A marca lida não cortou nada, então não aparece como chip na tela, nem o
    # "parecido com".
    assert eventos[0]["filters"] == {}
    assert eventos[0]["similarity"] is None
    assert eventos[0]["in_scope"] is False
    assert eventos[1]["delta"] == _FORA_DO_ESCOPO
    assert eventos[2]["match_type"] == "fallback"
    assert _ids(eventos) == [jaqueta.id]


@pytest.mark.postgres
def test_tipo_ausente_marca_alternativa_com_as_mesmas_pecas(
    pg_client: TestClient, pg_session: Session, monkeypatch
) -> None:
    loja = _loja(pg_session)
    calca = _peca(
        pg_session, loja, "Calça pantalona preta", _vetor(1), category="Roupas"
    )
    pg_session.commit()
    _usar(
        monkeypatch,
        _Provedor(
            InterpretedQuery(
                filters={"category": "Roupas"}, tipo="Vestido", in_scope=True
            ),
            _vetor(1),
        ),
    )

    eventos = _perguntar(pg_client, "vestido")

    assert [e["type"] for e in eventos] == ["interpreted", "text", "products", "done"]
    assert eventos[1]["delta"].startswith("Não encontrei vestido no catálogo.")
    assert eventos[2]["match_type"] == "fallback"
    assert _ids(eventos) == [calca.id]


@pytest.mark.postgres
def test_tipo_presente_pelo_sinonimo_continua_resultado_direto(
    pg_client: TestClient, pg_session: Session, monkeypatch
) -> None:
    loja = _loja(pg_session)
    tenis = _peca(pg_session, loja, "Tênis branco", _vetor(1), category="Sapatos")
    rasteira = _peca(
        pg_session, loja, "Rasteira de couro", _vetor(1, 0.5), category="Sapatos"
    )
    pg_session.commit()
    _usar(
        monkeypatch,
        _Provedor(
            InterpretedQuery(
                filters={"category": "Sapatos"}, tipo="Sandália", in_scope=True
            ),
            _vetor(1),
        ),
    )

    eventos = _perguntar(pg_client, "sandália")

    assert [e["type"] for e in eventos] == ["interpreted", "products", "done"]
    assert eventos[1]["match_type"] == "exact"
    assert _ids(eventos) == [tenis.id, rasteira.id]


@pytest.mark.postgres
def test_tipo_ausente_dentro_do_filtro_cita_o_que_faltou(
    pg_client: TestClient, pg_session: Session, monkeypatch
) -> None:
    """Em "tênis 42" o filtro acha scarpins 42, e o tipo não está entre eles."""
    loja = _loja(pg_session)
    scarpin = _peca(
        pg_session,
        loja,
        "Scarpin de couro",
        _vetor(1),
        category="Sapatos",
        size="42",
        price=Decimal("200"),
    )
    pg_session.commit()
    _usar(
        monkeypatch,
        _Provedor(
            InterpretedQuery(
                filters={"category": "Sapatos", "size": "42"},
                tipo="Tênis",
                in_scope=True,
            ),
            _vetor(1),
        ),
    )

    eventos = _perguntar(pg_client, "tênis 42")

    assert eventos[1]["delta"].startswith("Não encontrei tênis com tamanho 42.")
    assert eventos[2]["match_type"] == "fallback"
    assert _ids(eventos) == [scarpin.id]


@pytest.mark.postgres
def test_leitura_sem_escopo_nem_tipo_mantem_o_resultado_direto(
    pg_client: TestClient, pg_session: Session, monkeypatch
) -> None:
    """Modelo que não preencheu os campos novos: o comportamento de antes."""
    loja = _loja(pg_session)
    peca = _peca(pg_session, loja, "Jaqueta", _vetor(1), category="Roupas")
    pg_session.commit()
    _usar(monkeypatch, _Provedor(InterpretedQuery(), _vetor(1)))

    eventos = _perguntar(pg_client, "algo anos 90")

    assert eventos[1]["match_type"] == "exact"
    assert _ids(eventos) == [peca.id]


@pytest.mark.postgres
def test_leitura_que_falha_mantem_o_resultado_direto(
    pg_client: TestClient, pg_session: Session, monkeypatch
) -> None:
    loja = _loja(pg_session)
    peca = _peca(pg_session, loja, "Jaqueta", _vetor(1), category="Roupas")
    pg_session.commit()
    _usar(monkeypatch, _Provedor(AIProviderUnavailableError("504"), _vetor(1)))

    eventos = _perguntar(pg_client, "geladeira 400 litros")

    assert [e["type"] for e in eventos] == ["products", "done"]
    assert eventos[0]["match_type"] == "exact"
    assert _ids(eventos) == [peca.id]


@pytest.mark.postgres
def test_peca_de_nome_sem_tipo_nao_salva_o_rotulo(
    pg_client: TestClient, pg_session: Session, monkeypatch
) -> None:
    """O critério da #231: nenhuma peça do tipo pedido entre as devolvidas é
    alternativa. Um "Cropped" entre as cinco não vira vestido."""
    loja = _loja(pg_session)
    cropped = _peca(
        pg_session, loja, "Cropped de alcinha", _vetor(1), category="Roupas"
    )
    calca = _peca(
        pg_session, loja, "Calça pantalona", _vetor(1, 0.5), category="Roupas"
    )
    pg_session.commit()
    _usar(
        monkeypatch,
        _Provedor(
            InterpretedQuery(
                filters={"category": "Roupas"}, tipo="Vestido", in_scope=True
            ),
            _vetor(1),
        ),
    )

    eventos = _perguntar(pg_client, "vestido")

    assert eventos[1]["delta"].startswith("Não encontrei vestido no catálogo.")
    assert eventos[2]["match_type"] == "fallback"
    assert _ids(eventos) == [cropped.id, calca.id]
