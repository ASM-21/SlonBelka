"""sentence source_ref identity

Revision ID: b7d41c09aa52
Revises: 5c855cc222d4
Create Date: 2026-07-10 08:20:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b7d41c09aa52'
down_revision: Union[str, None] = '5c855cc222d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Nullable, so this is safe on populated tables; existing rows simply have
    # no stable source reference. NULLs never collide under the unique
    # constraint on either sqlite or Postgres.
    with op.batch_alter_table("example_sentences") as batch:
        batch.add_column(sa.Column("source_ref", sa.String(length=64), nullable=True))
        batch.create_unique_constraint("uq_sentence_item_source", ["item_id", "source_ref"])


def downgrade() -> None:
    with op.batch_alter_table("example_sentences") as batch:
        batch.drop_constraint("uq_sentence_item_source", type_="unique")
        batch.drop_column("source_ref")
