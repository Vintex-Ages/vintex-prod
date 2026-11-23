"""Cancelamento do pedido pelo comprador, antes do comprovante."""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.clock import utcnow_naive
from app.core.security import create_access_token
from app.models import Payment
from tests.test_order_expire import (
    cenario,  # noqa: F401 - fixture
    historico,
    make_user,
    pedir,
    status_de,
    vencer,
)


def _cancelar(client: TestClient, user_id: int, order_id: int):
    return client.post(
        f"/api/users/me/orders/{order_id}/cancel",
        headers={
            "Authorization": f"Bearer {create_access_token(user_id, is_admin=False)}"
        },
    )


def test_cancela_e_devolve_todas_as_pecas_a_venda(
    client: TestClient, db_session: Session, cenario  # noqa: F811
) -> None:
    pedido = pedir(db_session, cenario["buyer"], cenario["Jaqueta"], cenario["Saia"])
    assert status_de(db_session, cenario["Jaqueta"]) == ["reservado"]

    resposta = _cancelar(client, cenario["buyer"].id, pedido.id)

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["status"] == "cancelado"
    assert [h["status"] for h in corpo["history"]] == [
        "aguardando_comprovante",
        "cancelado",
    ]
    assert status_de(db_session, pedido, cenario["Jaqueta"], cenario["Saia"]) == [
        "cancelado",
        "ativo",
        "ativo",
    ]


def test_peca_do_pedido_cancelado_pode_ser_comprada_de_novo(
    client: TestClient, db_session: Session, cenario  # noqa: F811
) -> None:
    pedido = pedir(db_session, cenario["buyer"], cenario["Jaqueta"])
    _cancelar(client, cenario["buyer"].id, pedido.id)

    novo = pedir(
        db_session, make_user(db_session, "outra@test.local"), cenario["Jaqueta"]
    )

    assert novo.status == "aguardando_comprovante"
    assert status_de(db_session, cenario["Jaqueta"]) == ["reservado"]


def test_cancelar_um_pedido_nao_solta_a_peca_de_outro(
    client: TestClient, db_session: Session, cenario  # noqa: F811
) -> None:
    pedido = pedir(db_session, cenario["buyer"], cenario["Jaqueta"])
    pedir(db_session, cenario["buyer"], cenario["Saia"])

    _cancelar(client, cenario["buyer"].id, pedido.id)

    assert status_de(db_session, cenario["Saia"]) == ["reservado"]


def test_cancelar_de_novo_responde_409_e_nao_solta_a_peca_do_pedido_novo(
    client: TestClient, db_session: Session, cenario  # noqa: F811
) -> None:
    """A peça do cancelado já foi comprada por outra pessoa: repetir o
    cancelamento não pode devolvê-la à venda."""
    pedido = pedir(db_session, cenario["buyer"], cenario["Jaqueta"])
    _cancelar(client, cenario["buyer"].id, pedido.id)
    pedir(db_session, make_user(db_session, "outra@test.local"), cenario["Jaqueta"])

    resposta = _cancelar(client, cenario["buyer"].id, pedido.id)

    assert resposta.status_code == 409
    assert resposta.json()["error"]["code"] == "ORDER_NOT_CANCELABLE"
    assert status_de(db_session, cenario["Jaqueta"]) == ["reservado"]


@pytest.mark.parametrize("status", ["em_analise", "confirmado"])
def test_pedido_que_ja_saiu_da_espera_nao_cancela(
    client: TestClient, db_session: Session, cenario, status: str  # noqa: F811
) -> None:
    pedido = pedir(db_session, cenario["buyer"], cenario["Jaqueta"])
    pedido.status = status
    db_session.commit()

    resposta = _cancelar(client, cenario["buyer"].id, pedido.id)

    assert resposta.status_code == 409
    assert status_de(db_session, pedido, cenario["Jaqueta"]) == [status, "reservado"]


def test_comprovante_recusado_nao_cancela(
    client: TestClient, db_session: Session, cenario  # noqa: F811
) -> None:
    """A recusa devolve o pedido a `aguardando_comprovante` (RN-23), mas pode
    haver Pix pago: quem decide é a administradora."""
    pedido = pedir(db_session, cenario["buyer"], cenario["Jaqueta"])
    db_session.add(
        Payment(
            order_id=pedido.id,
            receipt_key="receipts/x.jpg",
            receipt_name="x.jpg",
            receipt_content_type="image/jpeg",
            status="rejeitado",
            rejection_reason="Ilegível",
            validated_by_id=cenario["buyer"].id,
            validated_at=utcnow_naive() - timedelta(minutes=1),
        )
    )
    db_session.commit()

    resposta = _cancelar(client, cenario["buyer"].id, pedido.id)

    assert resposta.status_code == 409
    assert status_de(db_session, cenario["Jaqueta"]) == ["reservado"]


def test_pedido_vencido_expira_em_vez_de_cancelar(
    client: TestClient, db_session: Session, cenario  # noqa: F811
) -> None:
    pedido = pedir(db_session, cenario["buyer"], cenario["Jaqueta"])
    vencer(db_session, pedido)

    resposta = _cancelar(client, cenario["buyer"].id, pedido.id)

    assert resposta.status_code == 409
    assert status_de(db_session, pedido, cenario["Jaqueta"]) == ["expirado", "ativo"]
    assert historico(db_session, pedido) == ["aguardando_comprovante", "expirado"]


def test_pedido_de_outra_pessoa_responde_404(
    client: TestClient, db_session: Session, cenario  # noqa: F811
) -> None:
    pedido = pedir(db_session, cenario["buyer"], cenario["Jaqueta"])
    outra = make_user(db_session, "outra@test.local")
    db_session.commit()

    resposta = _cancelar(client, outra.id, pedido.id)

    assert resposta.status_code == 404
    assert status_de(db_session, pedido) == ["aguardando_comprovante"]


def test_sem_login_responde_401(client: TestClient) -> None:
    assert client.post("/api/users/me/orders/1/cancel").status_code == 401
