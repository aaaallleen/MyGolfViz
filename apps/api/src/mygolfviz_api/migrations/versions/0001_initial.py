"""initial schema

Revision ID: 0001
Revises:
"""
import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sessions",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("date", sa.String, nullable=False),
        sa.Column("notes", sa.String),
        sa.Column("handedness", sa.String),
        sa.Column("created_at", sa.String, nullable=False),
        sa.Column("updated_at", sa.String, nullable=False),
    )
    op.create_table(
        "imports",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column(
            "session_id",
            sa.String,
            sa.ForeignKey("sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("original_filename", sa.String, nullable=False),
        sa.Column("display_name", sa.String),
        sa.Column("sha256", sa.String, nullable=False),
        sa.Column("byte_length", sa.Integer, nullable=False),
        sa.Column("ordinal", sa.Integer, nullable=False),
        sa.Column("parser_version", sa.String, nullable=False),
        sa.Column("shot_count", sa.Integer, nullable=False),
        sa.Column("summary_row_count", sa.Integer, nullable=False),
        sa.Column("warnings", sa.JSON, nullable=False),
        sa.Column("imported_at", sa.String, nullable=False),
        sa.UniqueConstraint("session_id", "sha256"),
    )
    op.create_table(
        "shots",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column(
            "import_id",
            sa.String,
            sa.ForeignKey("imports.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("source_row", sa.Integer, nullable=False),
        sa.Column("shot_label", sa.String),
        sa.Column("club", sa.String),
        sa.Column("shot_type", sa.String),
        sa.Column("mode", sa.String),
        sa.Column("location", sa.String),
        sa.Column("measurements", sa.JSON, nullable=False),
        sa.Column("raw", sa.JSON, nullable=False),
        sa.Column("flags", sa.JSON, nullable=False),
        sa.UniqueConstraint("import_id", "source_row"),
    )
    op.create_index("ix_shots_club", "shots", ["club"])
    op.create_index("ix_shots_import_id", "shots", ["import_id"])
    op.create_table(
        "exclusions",
        sa.Column(
            "session_id",
            sa.String,
            sa.ForeignKey("sessions.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("sha256", sa.String, primary_key=True),
        sa.Column("source_row", sa.Integer, primary_key=True),
        sa.Column("excluded_at", sa.String, nullable=False),
    )
    op.create_table(
        "settings",
        sa.Column("key", sa.String, primary_key=True),
        sa.Column("value", sa.JSON, nullable=False),
        sa.Column("updated_at", sa.String, nullable=False),
    )
    op.create_table(
        "target_ranges",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("club", sa.String, nullable=False),
        sa.Column("metric", sa.String, nullable=False),
        sa.Column("low", sa.Float),
        sa.Column("high", sa.Float),
        sa.Column("updated_at", sa.String, nullable=False),
        sa.UniqueConstraint("club", "metric"),
    )


def downgrade() -> None:
    for t in ("target_ranges", "settings", "exclusions", "shots", "imports", "sessions"):
        op.drop_table(t)
