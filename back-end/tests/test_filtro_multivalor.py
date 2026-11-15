"""Filtro de múltipla escolha no catálogo (back-end#351).

A tela deixa marcar mais de um tamanho, marca, conservação ou cor, e o front
manda o parâmetro repetido: `size=M&size=G` (`catalogService.ts`). Os valores do
mesmo filtro somam por OU; filtros diferentes seguem combinando por E, como a
#87 estabeleceu.

Antes desta mudança o FastAPI entregava **só o último** valor, e marcar M e G
devolvia peças de um tamanho só, sem aviso nenhum.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.controllers.assistant_controller import _aviso_de_alternativas
from app.schemas.product_schema import ProductFilters
from tests.test_product_feed import make_product, make_store

# Um valor por peça, para o filtro de dois valores ter de trazer duas e deixar
# a terceira fora.
_VALORES = {
    "size": ("M", "G", "P"),
    "brand": ("Marca A", "Marca B", "Marca C"),
    "condition": ("Novo", "Bom", "Usado"),
    "color": ("Azul", "Verde", "Preto"),
}


def _tres_pecas(db_session: Session, campo: str) -> list[int]:
    """Três peças iguais em tudo, cada uma com um valor do filtro em teste."""
    store = make_store(db_session, f"Brechó {campo}")
    agora = datetime.now(timezone.utc)
    pecas = [
        make_product(
            db_session,
            store,
            f"Peça {valor}",
            agora - timedelta(minutes=posicao),
            **{campo: valor},
        )
        for posicao, valor in enumerate(_VALORES[campo])
    ]
    db_session.commit()
    return [peca.id for peca in pecas]


@pytest.mark.parametrize("campo", sorted(_VALORES))
def test_dois_valores_do_mesmo_filtro_somam(
    client: TestClient, db_session: Session, campo: str
) -> None:
    primeiro, segundo, _fora = _tres_pecas(db_session, campo)
    um, outro, _ = _VALORES[campo]

    resposta = client.get(f"/api/products?{campo}={um}&{campo}={outro}")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["total"] == 2
    assert {item["id"] for item in corpo["items"]} == {primeiro, segundo}


@pytest.mark.parametrize("campo", sorted(_VALORES))
def test_um_valor_so_continua_trazendo_a_peca_dele(
    client: TestClient, db_session: Session, campo: str
) -> None:
    primeiro, _segundo, _fora = _tres_pecas(db_session, campo)
    um, _, _ = _VALORES[campo]

    corpo = client.get(f"/api/products?{campo}={um}").json()

    assert corpo["total"] == 1
    assert corpo["items"][0]["id"] == primeiro


def test_filtros_diferentes_seguem_combinando_por_e(
    client: TestClient, db_session: Session
) -> None:
    """Tamanho M ou G **e** cor Azul ou Verde: a peça G preta fica fora."""
    store = make_store(db_session, "Brechó Combinado")
    agora = datetime.now(timezone.utc)
    dentro = make_product(db_session, store, "M azul", agora, size="M", color="Azul")
    make_product(
        db_session,
        store,
        "G preta",
        agora - timedelta(minutes=1),
        size="G",
        color="Preto",
    )
    make_product(
        db_session,
        store,
        "P verde",
        agora - timedelta(minutes=2),
        size="P",
        color="Verde",
    )
    db_session.commit()

    corpo = client.get("/api/products?size=M&size=G&color=Azul&color=Verde").json()

    assert corpo["total"] == 1
    assert corpo["items"][0]["id"] == dentro.id


def test_applied_filters_ecoa_string_com_um_valor_e_lista_com_varios(
    client: TestClient, db_session: Session
) -> None:
    """O eco é o que o front usa para exibir e remover cada filtro (#87).

    Com um valor só ele continua saindo como antes da #351, para não quebrar
    quem já lê a resposta.
    """
    _tres_pecas(db_session, "size")

    um = client.get("/api/products?size=M").json()
    varios = client.get("/api/products?size=M&size=G").json()

    assert um["applied_filters"] == {"size": "M"}
    assert varios["applied_filters"] == {"size": ["M", "G"]}


def test_caixa_diferente_casa_em_cada_um_dos_valores(
    client: TestClient, db_session: Session
) -> None:
    """RN-41: a comparação é feita sem caixa, e isso vale para cada valor da
    lista, não só para o primeiro."""
    primeiro, segundo, _fora = _tres_pecas(db_session, "brand")

    corpo = client.get("/api/products?brand=marca+a&brand=MARCA+B").json()

    assert corpo["total"] == 2
    assert {item["id"] for item in corpo["items"]} == {primeiro, segundo}


@pytest.mark.postgres
def test_acento_casa_em_cada_um_dos_valores(
    pg_client: TestClient, pg_session: Session
) -> None:
    """RN-41: sem acento também, o que depende do `unaccent` do Postgres."""
    store = make_store(pg_session, "Brechó Acento")
    agora = datetime.now(timezone.utc)
    cantao = make_product(pg_session, store, "Camisa", agora, brand="Cantão")
    farm = make_product(
        pg_session, store, "Saia", agora - timedelta(minutes=1), brand="Fárm"
    )
    make_product(
        pg_session, store, "Calça", agora - timedelta(minutes=2), brand="Outra"
    )
    pg_session.commit()

    corpo = pg_client.get("/api/products?brand=cantao&brand=farm").json()

    assert corpo["total"] == 2
    assert {item["id"] for item in corpo["items"]} == {cantao.id, farm.id}


def test_as_duas_entradas_declaram_o_filtro_como_lista(client: TestClient) -> None:
    """A query do feed e o formulário da busca por foto, no OpenAPI.

    É a declaração que faz o FastAPI juntar o parâmetro repetido: voltando a
    `str | None`, ele entrega só o último valor e o teste de cima passa a
    reprovar por um caminho difícil de ler. Aqui a regressão aparece direto.
    """
    lista = {"type": "array", "items": {"type": "string"}}
    spec = client.get("/openapi.json").json()

    query = {
        parametro["name"]: parametro["schema"]
        for parametro in spec["paths"]["/api/products"]["get"]["parameters"]
    }
    corpo_da_foto = spec["paths"]["/api/products/search-by-image"]["post"][
        "requestBody"
    ]["content"]["multipart/form-data"]["schema"]
    formulario = spec["components"]["schemas"][
        corpo_da_foto["$ref"].rsplit("/", 1)[-1]
    ]["properties"]

    for campo in _VALORES:
        assert lista in query[campo]["anyOf"], campo
        assert lista in formulario[campo]["anyOf"], campo
    # Categoria e localização não são de múltipla escolha: a tela escolhe uma.
    for campo in ("category", "city", "state"):
        assert lista not in query[campo]["anyOf"], campo


@pytest.mark.parametrize(
    "valor, esperado",
    [
        ("M", ["M"]),
        (["M", "G"], ["M", "G"]),
        ([], None),
        (None, None),
    ],
)
def test_o_modelo_guarda_sempre_lista(
    valor: object, esperado: list[str] | None
) -> None:
    """Por dentro o filtro é lista, venha string ou lista.

    A string é o caminho da sugestão de preço, que monta
    `ProductFilters(**valores)` com os campos do pedido
    (`price_suggestion_controller`).
    """
    assert ProductFilters(size=valor).size == esperado


def test_a_frase_de_alternativa_nomeia_todos_os_valores_pedidos() -> None:
    """RN-61: a busca sem resultado sugere alternativa em vez de dizer que não
    achou, e a frase diz o que faltou. Com dois tamanhos pedidos, os dois."""
    aviso = _aviso_de_alternativas(
        ProductFilters(size=["M", "G"], color=["Preto"], price_max=Decimal("300"))
    )

    assert aviso.startswith(
        "Não encontrei peças com Preto, tamanho M ou G e até R$ 300,00."
    )
