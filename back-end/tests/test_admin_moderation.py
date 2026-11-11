"""Moderação de anúncios pela administradora (back-end#327).

O caminho completo: a administradora tira a peça do ar com motivo, a peça sai
do catálogo, o vendedor vê o motivo e **não** consegue republicar, e só a
administradora devolve ao estado de onde tirou — a peça que o vendedor pausou
volta pausada, a que estava no ar volta `ativo`. É o que separa Pausada de
Suspensa.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Notification, Product, ProductImage, Seller, Store, User

SUSPENDER = "/api/admin/products/{}/unpublish"
DEVOLVER = "/api/admin/products/{}/publish"
LISTAR = "/api/admin/products"
CATALOGO = "/api/products/{}"
PAINEL_VENDEDOR = "/api/users/me/products"
PAUSAR = "/api/users/me/products/{}/unpublish"
PUBLICAR = "/api/users/me/products/{}/publish"
AVISOS = "/api/users/me/notifications"


def make_user(db: Session, name: str, email: str, *, is_admin: bool = False) -> User:
    user = User(
        name=name,
        email=email,
        password_hash="not-a-real-password",
        is_admin=is_admin,
    )
    db.add(user)
    db.flush()
    return user


def make_store(db: Session, name: str, dona: User) -> Store:
    store = Store(
        name=name,
        pix_key=f"{name.lower().replace(' ', '.')}@pix",
        seller=Seller(user=dona, document_type="CPF", document_value="52998224725"),
    )
    db.add(store)
    db.flush()
    return store


def make_product(
    db: Session, store: Store, name: str, *, status: str = "ativo", foto: bool = True
) -> Product:
    product = Product(
        store=store,
        name=name,
        price=Decimal("100.00"),
        status=status,
        images=(
            [ProductImage(image_url=f"https://cdn.test/{name}.jpg", position=0)]
            if foto
            else []
        ),
    )
    db.add(product)
    db.flush()
    return product


@pytest.fixture(autouse=True)
def sem_embedding_em_segundo_plano(monkeypatch):
    """O vetor é gerado depois da resposta, numa sessão que não é a do teste.

    Sem o dublê, a tarefa de fundo abre conexão nova no SQLite em memória (banco
    vazio) e derruba o teste que publica ou devolve a peça. O assunto do vetor é
    da #245, não desta tarefa.
    """
    monkeypatch.setattr(
        "app.views.product_routes.gerar_embedding_da_peca", lambda _id: None
    )
    monkeypatch.setattr(
        "app.views.admin_moderation_routes.gerar_embedding_da_peca", lambda _id: None
    )


@pytest.fixture
def cenario(db_session, auth_headers):
    marina = make_user(db_session, "Marina Oliveira", "marina@loja.test")
    loja = make_store(db_session, "Brechó Aurora", marina)
    admin = make_user(db_session, "Admin", "admin@test.local", is_admin=True)
    compradora = make_user(db_session, "Ana Souza", "ana@test.local")
    peca = make_product(db_session, loja, "Jaqueta")
    pausada = make_product(db_session, loja, "Bolsa", status="despublicado")
    db_session.commit()
    return {
        "db": db_session,
        "loja": loja,
        "peca": peca,
        "pausada": pausada,
        "admin_headers": auth_headers(admin.id, is_admin=True),
        "vendedora_headers": auth_headers(marina.id),
        "compradora_headers": auth_headers(compradora.id),
    }


def suspender(
    client, headers, product_id: int, motivo: str = "Fotos não são do produto"
):
    return client.post(
        SUSPENDER.format(product_id), json={"reason": motivo}, headers=headers
    )


def test_administradora_suspende_e_a_peca_sai_do_catalogo(cenario, client):
    peca = cenario["peca"]

    response = suspender(client, cenario["admin_headers"], peca.id)

    assert response.status_code == 200
    corpo = response.json()
    assert corpo["status"] == "despublicado"
    assert corpo["moderation_reason"] == "Fotos não são do produto"
    assert corpo["moderated_at"] is not None

    # Sai da vitrine e da busca: o detalhe público não acha mais.
    assert client.get(CATALOGO.format(peca.id)).status_code == 404

    # O vendedor vê o motivo na peça dele (RN-80).
    painel = client.get(PAINEL_VENDEDOR, headers=cenario["vendedora_headers"])
    item = next(i for i in painel.json()["items"] if i["id"] == peca.id)
    assert item["status"] == "despublicado"
    assert item["moderation_reason"] == "Fotos não são do produto"
    assert item["moderated_at"] is not None

    # E foi avisado in-app (RN-84, RN-80).
    avisos = list(
        cenario["db"].scalars(
            select(Notification).where(
                Notification.type == "moderation",
                Notification.product_id == peca.id,
            )
        )
    )
    assert len(avisos) == 1

    # O sino diz por que ela saiu do ar, não só que saiu (RN-80): o motivo vai
    # na resposta da notificação, e não só na peça.
    sino = client.get(AVISOS, headers=cenario["vendedora_headers"]).json()
    aviso = next(item for item in sino["items"] if item["product_id"] == peca.id)
    assert aviso["type"] == "moderation"
    assert aviso["moderation_reason"] == "Fotos não são do produto"


def test_suspender_de_novo_troca_o_motivo_sem_duplicar_o_aviso(cenario, client):
    peca = cenario["peca"]
    suspender(client, cenario["admin_headers"], peca.id, "Fotos não são do produto")
    suspender(client, cenario["admin_headers"], peca.id, "Preço enganoso")

    sino = client.get(AVISOS, headers=cenario["vendedora_headers"]).json()
    avisos = [item for item in sino["items"] if item["type"] == "moderation"]
    assert len(avisos) == 1
    assert avisos[0]["moderation_reason"] == "Preço enganoso"


def test_vendedor_nao_republica_peca_suspensa(cenario, client):
    peca = cenario["peca"]
    suspender(client, cenario["admin_headers"], peca.id)

    response = client.post(
        PUBLICAR.format(peca.id), headers=cenario["vendedora_headers"]
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PRODUCT_SUSPENDED"


def test_administradora_devolve_a_peca_a_vitrine(cenario, client):
    peca = cenario["peca"]
    suspender(client, cenario["admin_headers"], peca.id)

    response = client.post(DEVOLVER.format(peca.id), headers=cenario["admin_headers"])

    assert response.status_code == 200
    corpo = response.json()
    assert corpo["status"] == "ativo"
    assert corpo["moderation_reason"] is None
    assert corpo["moderated_at"] is None

    detalhe = client.get(CATALOGO.format(peca.id))
    assert detalhe.status_code == 200
    assert detalhe.json()["status"] == "ativo"

    # A origem não fica para a suspensão seguinte: a próxima devolução lê o
    # estado gravado por ela, não o desta.
    cenario["db"].refresh(peca)
    assert peca.moderation_previous_status is None


def test_devolver_a_peca_pausada_a_devolve_pausada(cenario, client):
    """Suspender e devolver a peça que o vendedor pausou não a publica (RN-50).

    As duas são `despublicado` no status; quem decide para onde a peça volta é
    o estado de origem gravado na suspensão, não um `ativo` fixo.
    """
    pausada = cenario["pausada"]
    assert suspender(client, cenario["admin_headers"], pausada.id).status_code == 200

    response = client.post(
        DEVOLVER.format(pausada.id), headers=cenario["admin_headers"]
    )

    assert response.status_code == 200
    assert response.json()["status"] == "despublicado"
    # Fora do feed, como estava: a moderação não publica no lugar do vendedor.
    assert client.get(CATALOGO.format(pausada.id)).status_code == 404

    # E o caminho de volta ao feed continua sendo o `publish` do vendedor.
    publicar = client.post(
        PUBLICAR.format(pausada.id), headers=cenario["vendedora_headers"]
    )
    assert publicar.status_code == 200
    assert publicar.json()["status"] == "ativo"


def test_cada_suspensao_deixa_o_proprio_aviso(cenario, client):
    """Devolver e suspender de novo não reescreve o aviso da suspensão anterior.

    O sino conta o que aconteceu, com a data de cada suspensão; suspender de
    novo dentro da mesma suspensão muda só o motivo do aviso em curso.
    """
    peca = cenario["peca"]

    suspender(client, cenario["admin_headers"], peca.id, "Fotos não são do produto")
    client.post(DEVOLVER.format(peca.id), headers=cenario["admin_headers"])
    suspender(client, cenario["admin_headers"], peca.id, "Preço enganoso")
    suspender(client, cenario["admin_headers"], peca.id, "Réplica não declarada")

    sino = client.get(AVISOS, headers=cenario["vendedora_headers"]).json()
    avisos = [item for item in sino["items"] if item["type"] == "moderation"]

    # Um aviso por suspensão: o primeiro fica com o motivo e a data dele, e o
    # segundo nasce com o motivo da suspensão em curso.
    assert [aviso["moderation_reason"] for aviso in avisos] == [
        "Réplica não declarada",
        "Fotos não são do produto",
    ]
    primeira = datetime.fromisoformat(avisos[1]["created_at"])
    segunda = datetime.fromisoformat(avisos[0]["created_at"])
    assert primeira < segunda


def test_motivo_vazio_responde_422(cenario, client):
    response = suspender(
        client, cenario["admin_headers"], cenario["peca"].id, motivo="   "
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


@pytest.mark.parametrize(
    ("status", "codigo"),
    [
        ("vendido", "PRODUCT_SOLD"),
        ("reservado", "PRODUCT_NOT_EDITABLE"),
        # Rascunho nunca esteve no feed: suspender só mudaria a peça de aba no
        # painel do vendedor, sem nada para devolver à vitrine.
        ("rascunho", "PRODUCT_NOT_EDITABLE"),
    ],
)
def test_peca_vendida_reservada_ou_rascunho_nao_e_suspensa(
    cenario, client, status, codigo
):
    db = cenario["db"]
    peca = make_product(db, cenario["loja"], f"Peca {status}", status=status)
    db.commit()

    response = suspender(client, cenario["admin_headers"], peca.id)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == codigo
    db.refresh(peca)
    assert peca.status == status
    assert peca.moderation_reason is None


def test_sem_sessao_responde_401(cenario, client):
    response = client.post(SUSPENDER.format(cenario["peca"].id), json={"reason": "x"})

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTH_REQUIRED"


def test_dono_da_peca_nao_suspende_a_propria_peca(cenario, client):
    """A área é da administradora, e o dono da peça não é administradora (RN-32)."""
    response = suspender(client, cenario["vendedora_headers"], cenario["peca"].id)

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "ADMIN_REQUIRED"


def test_lista_so_as_suspensas(cenario, client):
    peca = cenario["peca"]
    suspender(client, cenario["admin_headers"], peca.id)

    response = client.get(f"{LISTAR}?moderated=true", headers=cenario["admin_headers"])

    assert response.status_code == 200
    corpo = response.json()
    assert corpo["total"] == 1
    assert corpo["items"][0]["id"] == peca.id
    assert corpo["items"][0]["store"]["name"] == "Brechó Aurora"
    assert corpo["items"][0]["moderated_by"]["name"] == "Admin"
    # A peça que o vendedor pausou sozinho não entra: não é Suspensa.
    assert cenario["pausada"].id not in [item["id"] for item in corpo["items"]]


def test_lista_sem_moderated_true_responde_422(cenario, client):
    response = client.get(LISTAR, headers=cenario["admin_headers"])

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_peca_sem_foto_nao_volta_a_vitrine(cenario, client):
    db = cenario["db"]
    peca = make_product(db, cenario["loja"], "Sem foto")
    db.commit()
    suspender(client, cenario["admin_headers"], peca.id)
    db.query(ProductImage).filter(ProductImage.product_id == peca.id).delete()
    db.commit()

    response = client.post(DEVOLVER.format(peca.id), headers=cenario["admin_headers"])

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_vendedor_continua_republicando_a_peca_que_ele_pausou(cenario, client):
    peca = cenario["peca"]
    client.post(PAUSAR.format(peca.id), headers=cenario["vendedora_headers"])

    response = client.post(
        PUBLICAR.format(peca.id), headers=cenario["vendedora_headers"]
    )

    assert response.status_code == 200
    assert response.json()["status"] == "ativo"
    cenario["db"].refresh(peca)
    assert peca.moderation_reason is None
