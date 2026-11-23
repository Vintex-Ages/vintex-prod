"""add cancelado em orders e order_status_history

Revision ID: f7b2d4a9c1e6
Revises: d9a4c6e2b8f1
Create Date: 2026-11-23

O comprador cancela o pedido antes de enviar o comprovante. O CHECK do status
está nas duas tabelas, e as duas passam a aceitar `cancelado`.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "f7b2d4a9c1e6"
down_revision: Union[str, None] = "d9a4c6e2b8f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_STATUS = (
    "'aguardando_comprovante', 'em_analise', 'confirmado', "
    "'preparando', 'enviado', 'concluido', 'expirado'"
)
_CHECKS = (
    ("orders", "ck_orders_status"),
    ("order_status_history", "ck_order_status_history_status"),
)


def upgrade() -> None:
    for tabela, nome in _CHECKS:
        op.drop_constraint(nome, tabela, type_="check")
        op.create_check_constraint(nome, tabela, f"status IN ({_STATUS}, 'cancelado')")


def downgrade() -> None:
    # Sem `cancelado` no CHECK antigo, a saída mais próxima é `expirado`: as
    # peças já voltaram a `ativo` nos dois casos.
    for tabela, nome in _CHECKS:
        op.drop_constraint(nome, tabela, type_="check")
        op.execute(
            f"UPDATE {tabela} SET status = 'expirado' WHERE status = 'cancelado'"
        )
        op.create_check_constraint(nome, tabela, f"status IN ({_STATUS})")
