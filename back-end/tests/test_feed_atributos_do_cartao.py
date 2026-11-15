"""Categoria, tamanho e conservação em toda listagem de peça (back-end#352).

O cartão do catálogo mostra os três, e o feed não os devolvia: o front buscava o
detalhe de cada peça da página para completar, 1 requisição de feed mais 20 de
detalhe (`catalogService.ts`, que declara isso como débito).

A **RN-39** declara o feed com foto, título, preço e loja. Os três campos são
atributos da peça pela **RN-49**, e estão na resposta porque o cartão os desenha.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.repositories.product_repository import _feed_select
from app.schemas.product_schema import ProductFeedItemResponse, ProductImageSearchItem
from tests.test_product_feed import make_product, make_store

_DO_CARTAO = ("category", "size", "condition")


def test_o_item_do_feed_leva_os_tres_atributos_do_cartao(
    client: TestClient, db_session: Session
) -> None:
    store = make_store(db_session, "Brechó do Cartão")
    make_product(
        db_session,
        store,
        "Jaqueta jeans",
        datetime.now(timezone.utc),
        category="Jaquetas",
        size="M",
        condition="Bom",
        color="Azul",
        brand="Marca A",
    )
    db_session.commit()

    item = client.get("/api/products").json()["items"][0]

    assert (item["category"], item["size"], item["condition"]) == (
        "Jaquetas",
        "M",
        "Bom",
    )


def test_atributo_vazio_sai_nulo_e_a_peca_continua_na_lista(
    client: TestClient, db_session: Session
) -> None:
    """Peça antiga, cadastrada sem os atributos, não pode sumir do catálogo."""
    store = make_store(db_session, "Brechó Incompleto")
    agora = datetime.now(timezone.utc)
    make_product(db_session, store, "Sem atributo", agora)
    make_product(
        db_session, store, "Com atributo", agora - timedelta(minutes=1), size="G"
    )
    db_session.commit()

    corpo = client.get("/api/products").json()

    assert corpo["total"] == 2
    sem, com = corpo["items"]
    assert (sem["category"], sem["size"], sem["condition"]) == (None, None, None)
    assert com["size"] == "G"


def test_a_projecao_compartilhada_leva_os_tres() -> None:
    """`_feed_select` é a base de toda listagem de peça: o feed, os favoritos, o
    carrinho e a busca por semelhança. Projetar os três ali é o que faz os cinco
    endpoints devolverem os mesmos campos, sem consulta nova."""
    colunas = set(_feed_select().selected_columns.keys())

    assert set(_DO_CARTAO) <= colunas


def test_as_respostas_que_listam_peca_declaram_os_tres(client: TestClient) -> None:
    """No OpenAPI, para a regressão aparecer no contrato e não só numa tela."""
    componentes = client.get("/openapi.json").json()["components"]["schemas"]

    for nome in ("ProductFeedItemResponse", "ProductImageSearchItem"):
        propriedades = componentes[nome]["properties"]
        for campo in _DO_CARTAO:
            assert campo in propriedades, f"{nome}.{campo}"


def test_o_modelo_do_item_declara_os_tres_opcionais() -> None:
    """Opcionais: peça sem o atributo preenchido não pode falhar a serialização
    de uma página inteira."""
    for campo in _DO_CARTAO:
        assert ProductFeedItemResponse.model_fields[campo].default is None
        assert campo in ProductImageSearchItem.model_fields


def test_o_eco_de_store_id_sai_inteiro(client: TestClient, db_session: Session) -> None:
    """`applied_filters.store_id` saía `7.0`, porque `int` caía no `float` da
    união do dicionário. Era anterior à #352 e vai junto, no mesmo arquivo."""
    store = make_store(db_session, "Brechó do Eco")
    make_product(db_session, store, "Peça", datetime.now(timezone.utc))
    db_session.commit()

    eco = client.get(f"/api/products?store_id={store.id}").json()["applied_filters"]

    assert eco == {"store_id": store.id}
    assert isinstance(eco["store_id"], int)
