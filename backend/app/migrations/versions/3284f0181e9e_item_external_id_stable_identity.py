"""item external_id stable identity

Revision ID: 3284f0181e9e
Revises: ac23b7f69bc3
Create Date: 2026-07-01 07:51:47.054394
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '3284f0181e9e'
down_revision: Union[str, None] = 'ac23b7f69bc3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add nullable first so this is safe on databases that already hold items.
    op.add_column("items", sa.Column("external_id", sa.String(length=128), nullable=True))

    # Backfill existing rows with the default key: "{pos}:{lemma}:0".
    items = sa.table(
        "items",
        sa.column("id", sa.Integer),
        sa.column("lemma", sa.String),
        sa.column("part_of_speech", sa.String),
        sa.column("external_id", sa.String),
    )
    conn = op.get_bind()
    for row in conn.execute(sa.select(items.c.id, items.c.lemma, items.c.part_of_speech)):
        pos = ((row.part_of_speech or "x").strip().lower()) or "x"
        base = "-".join((row.lemma or "").strip().lower().split())
        conn.execute(
            items.update().where(items.c.id == row.id).values(external_id=f"{pos}:{base}:0")
        )

    op.create_index(op.f("ix_items_external_id"), "items", ["external_id"], unique=True)
    # Enforce NOT NULL. batch mode makes this work on SQLite as well as Postgres.
    with op.batch_alter_table("items") as batch:
        batch.alter_column("external_id", existing_type=sa.String(length=128), nullable=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_items_external_id"), table_name="items")
    op.drop_column("items", "external_id")
