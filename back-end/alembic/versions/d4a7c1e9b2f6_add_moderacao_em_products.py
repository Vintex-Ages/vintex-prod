"""moderação de anúncios: motivo, data e autor na peça (#327)

Revision ID: d4a7c1e9b2f6
Revises: c8f3b1e5d2a4
Create Date: 2026-11-04

A peça que a administradora tira do ar (RN-80) precisa se distinguir da peça
que o próprio vendedor pausou: as duas são `despublicado` no status. Três
colunas guardam quem moderou, quando e por quê, e são o que o `publish` do
vendedor consulta para recusar a republicação. A quarta guarda o estado de onde
a peça veio: sem ela, devolver à vitrine gravaria `ativo` e poria no feed a peça
que o vendedor tinha pausado (RN-50).

Sem tabela nova e sem alterar o `CheckConstraint` do status: `despublicado` já
existe. O aviso ao vendedor usa a tabela de notificações (#261), que ganha o
terceiro tipo e o motivo na própria linha: o sino precisa dizer por que a peça
saiu do ar, e o motivo da peça é apagado quando ela volta à vitrine.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "d4a7c1e9b2f6"
down_revision: Union[str, None] = "c8f3b1e5d2a4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "products", sa.Column("moderation_reason", sa.String(500), nullable=True)
    )
    op.add_column("products", sa.Column("moderated_at", sa.DateTime(), nullable=True))
    op.add_column(
        "products", sa.Column("moderated_by_id", sa.BigInteger(), nullable=True)
    )
    op.create_foreign_key(
        "fk_products_moderated_by_id_users",
        "products",
        "users",
        ["moderated_by_id"],
        ["id"],
    )

    # De onde a suspensão tirou a peça. `suspend` recusa `vendido`, `reservado`
    # e `rascunho`, então a origem é `ativo` (estava no feed) ou
    # `despublicado` (o vendedor já a tinha pausado). O `restore` devolve para
    # ela em vez de gravar `ativo` fixo.
    op.add_column(
        "products",
        sa.Column("moderation_previous_status", sa.String(30), nullable=True),
    )
    op.create_check_constraint(
        "ck_products_moderation_previous_status",
        "products",
        "moderation_previous_status IS NULL"
        " OR moderation_previous_status IN ('ativo', 'despublicado')",
    )

    op.drop_constraint("ck_notifications_type", "notifications", type_="check")
    op.create_check_constraint(
        "ck_notifications_type",
        "notifications",
        "type IN ('sale', 'favorite', 'moderation')",
    )

    # O motivo viaja com o aviso: a peça volta e perde o motivo, o sino continua
    # contando por que ela saiu do ar.
    op.add_column(
        "notifications", sa.Column("moderation_reason", sa.String(500), nullable=True)
    )
    op.create_check_constraint(
        "ck_notifications_moderation",
        "notifications",
        "(type = 'moderation' AND moderation_reason IS NOT NULL)"
        " OR (type <> 'moderation' AND moderation_reason IS NULL)",
    )


def downgrade() -> None:
    op.drop_constraint("ck_notifications_moderation", "notifications", type_="check")
    op.drop_column("notifications", "moderation_reason")

    # O CHECK antigo não aceita o tipo novo: as linhas precisam sair antes de
    # ele voltar, senão o downgrade falha com dado de moderação gravado.
    op.execute("DELETE FROM notifications WHERE type = 'moderation'")
    op.drop_constraint("ck_notifications_type", "notifications", type_="check")
    op.create_check_constraint(
        "ck_notifications_type",
        "notifications",
        "type IN ('sale', 'favorite')",
    )

    op.drop_constraint(
        "ck_products_moderation_previous_status", "products", type_="check"
    )
    op.drop_column("products", "moderation_previous_status")

    op.drop_constraint(
        "fk_products_moderated_by_id_users", "products", type_="foreignkey"
    )
    op.drop_column("products", "moderated_by_id")
    op.drop_column("products", "moderated_at")
    op.drop_column("products", "moderation_reason")
