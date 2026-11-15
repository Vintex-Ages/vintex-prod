"""Recomendação pelo perfil de estilo, o "Garimpados para Você" (back-end#253).

`find_similar` só existe no Postgres com pgvector: roda com `pg_session`. O
provedor de IA é um dublê que gera vetor "por palavras", e as peças ganham o
vetor do próprio texto (`texto_da_peca`), como na publicação.
"""

from __future__ import annotations

import zlib
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from app.config import settings
from app.constants.embedding import EMBEDDING_DIM
from app.controllers.recommendation_controller import RecommendationController
from app.core.pagination import PageParams
from app.models import Product, ProductImage, Seller, Store, User, UserPreference
from app.repositories.product_repository import ProductRepository
from app.services import product_embedding, style_profile
from app.services.ai.base import AIProvider, AIProviderError
from app.services.product_embedding import texto_da_peca

pytestmark = pytest.mark.postgres

ROTA = "/api/users/me/recommendations"
DONO = 10
COMPRADORA = 20


def vetor_por_palavras(texto: str) -> list[float]:
    vetor = [0.0] * EMBEDDING_DIM
    for palavra in texto.lower().replace(",", " ").split():
        vetor[zlib.crc32(palavra.encode()) % EMBEDDING_DIM] += 1.0
    return vetor


class _ProviderPorPalavras(AIProvider):
    def __init__(self) -> None:
        self.textos: list[str] = []
        self.falha: Exception | None = None

    def analyze_image(self, image_urls):  # pragma: no cover - não usado
        raise NotImplementedError

    async def stream_interpret_search(self, query, history=()):  # pragma: no cover
        raise NotImplementedError
        yield

    def embed(self, texts):
        if self.falha:
            raise self.falha
        self.textos.extend(texts)
        return [vetor_por_palavras(texto) for texto in texts]


@pytest.fixture
def provider(monkeypatch, pg_session) -> _ProviderPorPalavras:
    stub = _ProviderPorPalavras()
    monkeypatch.setattr(style_profile, "get_ai_provider", lambda: stub)
    monkeypatch.setattr(product_embedding, "get_ai_provider", lambda: stub)
    # A geração em segundo plano da publicação entra na transação do teste.
    monkeypatch.setattr(
        product_embedding,
        "SessionLocal",
        lambda: Session(
            bind=pg_session.connection(), join_transaction_mode="create_savepoint"
        ),
    )
    style_profile.limpar_cache()
    yield stub
    style_profile.limpar_cache()


@pytest.fixture
def loja(pg_session) -> Store:
    store = Store(
        name="Aurora",
        seller=Seller(
            user=User(id=DONO, name="Dona", email="dona@test.local", password_hash="x"),
            document_type="CPF",
            document_value="52998224725",
        ),
    )
    pg_session.add(store)
    pg_session.add(
        User(id=COMPRADORA, name="Ana", email="ana@test.local", password_hash="x")
    )
    pg_session.flush()
    return store


_AGORA = datetime.now(timezone.utc).replace(tzinfo=None)


def peca(db, store, nome: str, estilo: str | None, *, minutos: int = 0, vetor=True):
    product = Product(
        store=store,
        name=nome,
        style=estilo,
        price=Decimal("100.00"),
        status="ativo",
        images=[ProductImage(image_url=f"https://cdn.test/{nome}.jpg", position=0)],
        created_at=_AGORA - timedelta(minutes=minutos),
    )
    db.add(product)
    db.flush()
    if vetor:
        product.embedding = vetor_por_palavras(texto_da_peca(product))
        product.embedding_model = settings.GOOGLE_EMBEDDING_MODEL
    db.flush()
    return product


def perfil(db, user_id: int, *estilos: str, tipo: str = "estilo") -> None:
    db.add_all(UserPreference(user_id=user_id, type=tipo, value=v) for v in estilos)
    db.flush()


def recomendacoes(client, auth_headers, user_id=COMPRADORA, **params):
    return client.get(ROTA, headers=auth_headers(user_id), params=params)


@pytest.fixture
def catalogo(pg_session, loja):
    """Uma peça de cada estilo; a de alfaiataria é a mais recente do feed."""
    pecas = {
        "streetwear": peca(
            pg_session, loja, "Moletom gráfico oversized", "streetwear", minutos=30
        ),
        "boho": peca(
            pg_session, loja, "Vestido floral fluido", "boho-romantico", minutos=20
        ),
        "alfaiataria": peca(
            pg_session, loja, "Blazer estruturado", "alfaiataria", minutos=10
        ),
    }
    pg_session.commit()
    return pecas


# --- com perfil --------------------------------------------------------------------


def test_com_perfil_recebe_pecas_coerentes_e_personalized_true(
    pg_client, pg_session, auth_headers, provider, catalogo
):
    perfil(pg_session, COMPRADORA, "streetwear")
    pg_session.commit()

    body = recomendacoes(pg_client, auth_headers).json()

    assert body["personalized"] is True
    assert body["items"][0]["id"] == catalogo["streetwear"].id
    assert body["total"] == 3, "peça parecida, não só idêntica: a lista segue"


def test_o_perfil_vira_texto_com_o_estilo_do_onboarding(
    pg_client, pg_session, auth_headers, provider, catalogo
):
    perfil(pg_session, COMPRADORA, "boho-romantico")
    pg_session.commit()

    recomendacoes(pg_client, auth_headers)

    assert provider.textos == [
        "boho-romantico Boho Chic & Romântico "
        "Vestidos fluidos, estampas florais e tecidos naturais"
    ]


def test_o_mesmo_perfil_nao_chama_a_ia_a_cada_visita(
    pg_client, pg_session, auth_headers, provider, catalogo
):
    perfil(pg_session, COMPRADORA, "streetwear")
    pg_session.commit()

    for _ in range(3):
        recomendacoes(pg_client, auth_headers)

    assert len(provider.textos) == 1


# --- sem perfil ou sem como recomendar: feed genérico, nunca erro nem vazio --------


def test_sem_perfil_recebe_200_personalized_false_e_o_feed_generico(
    pg_client, pg_session, auth_headers, provider, catalogo
):
    response = recomendacoes(pg_client, auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["personalized"] is False
    feed = pg_client.get("/api/products").json()
    assert [i["id"] for i in body["items"]] == [i["id"] for i in feed["items"]]
    assert provider.textos == [], "sem perfil, nenhuma chamada à IA"


def test_preferencia_que_nao_e_estilo_nao_conta_como_perfil(
    pg_client, pg_session, auth_headers, provider, catalogo
):
    perfil(pg_session, COMPRADORA, "M", tipo="tamanho")
    pg_session.commit()

    assert recomendacoes(pg_client, auth_headers).json()["personalized"] is False


def test_sem_nenhuma_peca_com_vetor_vem_o_feed_e_nao_lista_vazia(
    pg_client, pg_session, auth_headers, provider, loja
):
    """Como na staging hoje, sem IA: o catálogo existe, mas sem vetor."""
    peca(pg_session, loja, "Sem vetor", "streetwear", vetor=False)
    perfil(pg_session, COMPRADORA, "streetwear")
    pg_session.commit()

    body = recomendacoes(pg_client, auth_headers).json()

    assert body["personalized"] is False
    assert body["total"] == 1 and body["items"]


@pytest.mark.parametrize("falha", [AIProviderError("503"), RuntimeError("rede")])
def test_falha_da_ia_vem_o_feed_e_nao_erro(
    pg_client, pg_session, auth_headers, provider, catalogo, falha
):
    perfil(pg_session, COMPRADORA, "streetwear")
    pg_session.commit()
    provider.falha = falha

    response = recomendacoes(pg_client, auth_headers)

    assert response.status_code == 200
    assert response.json()["personalized"] is False
    assert response.json()["total"] == 3


def test_catalogo_vazio_devolve_lista_vazia_sem_erro(
    pg_client, pg_session, auth_headers, provider, loja
):
    pg_session.commit()

    body = recomendacoes(pg_client, auth_headers).json()

    assert (body["items"], body["total"], body["personalized"]) == ([], 0, False)


# --- peça recém-publicada -----------------------------------------------------------


def test_peca_publicada_agora_aparece_sem_rodar_script(
    pg_client, pg_session, auth_headers, provider, catalogo, loja
):
    perfil(pg_session, COMPRADORA, "streetwear")
    nova = Product(
        store=loja,
        name="Moletom streetwear gráfico oversized",
        style="streetwear",
        price=Decimal("150.00"),
        status="rascunho",
        images=[ProductImage(image_url="https://cdn.test/nova.jpg", position=0)],
    )
    pg_session.add(nova)
    pg_session.commit()

    publicar = pg_client.post(
        f"/api/users/me/products/{nova.id}/publish", headers=auth_headers(DONO)
    )
    assert publicar.status_code == 200
    body = recomendacoes(pg_client, auth_headers).json()

    # Pela recomendação, e não pelo feed genérico: no feed ela também viria
    # primeiro, por ser a mais recente.
    assert body["personalized"] is True
    assert body["items"][0]["id"] == nova.id


# --- contrato -----------------------------------------------------------------------


def test_resposta_segue_o_contrato_e_o_item_e_o_do_feed(
    pg_client, pg_session, auth_headers, provider, catalogo
):
    perfil(pg_session, COMPRADORA, "streetwear")
    pg_session.commit()

    body = recomendacoes(pg_client, auth_headers).json()

    assert set(body) == {"items", "personalized", "page", "page_size", "total"}
    item = body["items"][0]
    feed_item = pg_client.get("/api/products").json()["items"][0]
    assert set(item) == set(feed_item)
    assert set(item["store"]) == {"id", "name", "verified"}
    assert isinstance(item["price"], float)


def _ids(resposta) -> list[int]:
    return [item["id"] for item in resposta.json()["items"]]


@pytest.fixture
def vitrine(pg_session, loja):
    """Peças em que a semelhança sozinha põe o estilo pedido no fim.

    O texto do perfil streetwear fala de "conforto urbano" e "oversized", e as
    peças de outro estilo repetem essas palavras: pelo vetor, ficam mais perto
    do perfil que as peças streetwear de nome curto.
    """
    pecas = {
        "boho_parecida": peca(
            pg_session,
            loja,
            "Vestido oversized conforto urbano streetwear inspirado",
            "boho-romantico",
        ),
        "alfa_parecida": peca(
            pg_session, loja, "Blazer oversized urbano conforto", "alfaiataria"
        ),
        "street_1": peca(pg_session, loja, "Moletom cinza", "streetwear"),
        "street_2": peca(pg_session, loja, "Tênis branco", "streetwear"),
        "boho_2": peca(pg_session, loja, "Saia floral", "boho-romantico"),
        "sem_estilo": peca(pg_session, loja, "Bolsa de palha", None),
    }
    pg_session.commit()
    return pecas


def test_as_pecas_do_estilo_vem_antes_das_outras(
    pg_client, pg_session, auth_headers, provider, vitrine
):
    perfil(pg_session, COMPRADORA, "streetwear")
    pg_session.commit()

    ids = _ids(recomendacoes(pg_client, auth_headers))

    street = {vitrine["street_1"].id, vitrine["street_2"].id}
    assert set(ids[:2]) == street
    assert len(ids) == len(vitrine)  # ninguém sai da lista (RN-61)


def test_perfil_com_dois_estilos_traz_os_dois_antes(
    pg_client, pg_session, auth_headers, provider, vitrine
):
    perfil(pg_session, COMPRADORA, "streetwear", "boho-romantico")
    pg_session.commit()

    ids = _ids(recomendacoes(pg_client, auth_headers))

    dos_estilos = {
        vitrine[k].id for k in ("street_1", "street_2", "boho_parecida", "boho_2")
    }
    assert set(ids[:4]) == dos_estilos
    assert set(ids[4:]) == {vitrine["alfa_parecida"].id, vitrine["sem_estilo"].id}


def test_dentro_de_cada_grupo_a_ordem_e_a_semelhanca(
    pg_client, pg_session, auth_headers, provider, vitrine
):
    """Os dois grupos seguem pela semelhança: a vitrine não vira ordem de id."""
    perfil(pg_session, COMPRADORA, "boho-romantico")
    pg_session.commit()

    ids = _ids(recomendacoes(pg_client, auth_headers))

    sem_estilo = _pela_semelhanca(pg_session, "boho-romantico")
    boho = {vitrine["boho_parecida"].id, vitrine["boho_2"].id}
    assert ids == [i for i in sem_estilo if i in boho] + [
        i for i in sem_estilo if i not in boho
    ]


def test_sem_a_preferencia_pelo_estilo_a_vitrine_esconde_o_streetwear(
    pg_session, provider, vitrine
):
    """Confere a premissa da vitrine: sem o conserto, o estilo não vem antes."""
    sem_estilo = _pela_semelhanca(pg_session, "streetwear")

    street = {vitrine["street_1"].id, vitrine["street_2"].id}
    assert set(sem_estilo[:2]) != street


def _pela_semelhanca(db, *estilos: str) -> list[int]:
    """A ordem só pela semelhança, como era antes da back-end#346."""
    texto = style_profile.texto_do_perfil(
        [UserPreference(type="estilo", value=v) for v in estilos]
    )
    rows, _ = ProductRepository(db).find_similar(
        vetor_por_palavras(texto),
        settings.GOOGLE_EMBEDDING_MODEL,
        PageParams(page=1, page_size=50),
    )
    return [row["id"] for row in rows]


def test_com_poucas_pecas_do_estilo_a_pagina_completa_com_as_outras(
    pg_session, provider, vitrine
):
    """A rota usa a página padrão; a página curta se confere no controller."""
    perfil(pg_session, COMPRADORA, "streetwear")
    pg_session.commit()

    primeira = RecommendationController(pg_session).recommend(
        COMPRADORA, PageParams(page=1, page_size=3)
    )

    assert primeira.total == len(vitrine)
    assert len(primeira.items) == 3
    street = {vitrine["street_1"].id, vitrine["street_2"].id}
    assert {i.id for i in primeira.items[:2]} == street


def test_a_ordem_do_estilo_vale_entre_as_paginas(pg_session, provider, vitrine):
    perfil(pg_session, COMPRADORA, "streetwear")
    pg_session.commit()
    controller = RecommendationController(pg_session)

    pagina_1 = controller.recommend(COMPRADORA, PageParams(page=1, page_size=2))
    pagina_2 = controller.recommend(COMPRADORA, PageParams(page=2, page_size=2))

    street = {vitrine["street_1"].id, vitrine["street_2"].id}
    assert {i.id for i in pagina_1.items} == street
    assert not street & {i.id for i in pagina_2.items}


def test_estilo_que_nenhuma_peca_tem_segue_pela_semelhanca(
    pg_client, pg_session, auth_headers, provider, vitrine
):
    perfil(pg_session, COMPRADORA, "gotico-dark")
    pg_session.commit()

    resposta = recomendacoes(pg_client, auth_headers).json()

    assert resposta["personalized"] is True
    assert len(resposta["items"]) == len(vitrine)


def test_paginacao(pg_client, pg_session, auth_headers, provider, loja):
    for i in range(23):
        peca(pg_session, loja, f"Moletom {i}", "streetwear", minutos=i)
    perfil(pg_session, COMPRADORA, "streetwear")
    pg_session.commit()

    primeira = recomendacoes(pg_client, auth_headers).json()
    segunda = recomendacoes(pg_client, auth_headers, page=2).json()

    assert (primeira["page"], primeira["page_size"], primeira["total"]) == (1, 20, 23)
    assert len(primeira["items"]) == 20
    assert (segunda["page"], len(segunda["items"])) == (2, 3)
    assert not {i["id"] for i in primeira["items"]} & {
        i["id"] for i in segunda["items"]
    }


def test_pagina_invalida_responde_422(pg_client, auth_headers, provider, loja):
    assert recomendacoes(pg_client, auth_headers, page=0).status_code == 422


def test_sem_token_responde_401(pg_client):
    assert pg_client.get(ROTA).status_code == 401
