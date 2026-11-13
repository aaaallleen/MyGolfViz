"""Safety of schema upgrades: all-or-nothing migrations, backup retention, the
"migrating" signal, and that the models never drift from the migrations."""

from __future__ import annotations

import shutil
import sqlite3
from pathlib import Path

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import create_engine

from mygolfviz_api import migrate
from mygolfviz_api.models import Base

MIGRATIONS = Path(migrate.__file__).parent / "migrations"

FAILING_0002 = '''"""fails halfway

Revision ID: 0002
Revises: 0001
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("half_done", sa.Column("id", sa.Integer, primary_key=True))
    op.add_column("sessions", sa.Column("extra", sa.String))
    op.execute("UPDATE sessions SET name = 'changed'")
    raise RuntimeError("migration blew up halfway")


def downgrade() -> None:
    pass
'''


def tables(path: Path) -> set[str]:
    con = sqlite3.connect(path)
    try:
        return {r[0] for r in con.execute("select name from sqlite_master where type='table'")}
    finally:
        con.close()


def make_stale_db(settings) -> None:
    """A database whose schema is older than the app's (stamped at base)."""
    command.stamp(migrate.make_config(settings), "base")
    con = sqlite3.connect(migrate.db_path(settings))
    con.execute("create table legacy (x integer)")
    con.commit()
    con.close()


def test_a_migration_that_fails_halfway_changes_nothing(settings, tmp_path):
    migrate.upgrade(settings)
    db = migrate.db_path(settings)
    con = sqlite3.connect(db)
    con.execute(
        "insert into sessions (id, name, date, created_at, updated_at) values ('s', 'Range', '2026-01-01', 'x', 'x')"
    )
    con.commit()
    con.close()

    scripts = tmp_path / "scripts"
    shutil.copytree(MIGRATIONS, scripts, ignore=shutil.ignore_patterns("__pycache__"))
    (scripts / "versions" / "0002_fails.py").write_text(FAILING_0002)
    cfg = migrate.make_config(settings)
    cfg.set_main_option("script_location", str(scripts))

    with pytest.raises(RuntimeError, match="blew up halfway"):
        command.upgrade(cfg, "head")

    assert "half_done" not in tables(db)
    con = sqlite3.connect(db)
    try:
        cols = {r[1] for r in con.execute("pragma table_info(sessions)")}
        name = con.execute("select name from sessions").fetchone()[0]
    finally:
        con.close()
    assert "extra" not in cols
    assert name == "Range"
    assert migrate.current_revision(settings) == "0001"


def backup_names(settings) -> list[str]:
    return sorted(p.name for p in (settings.data_dir / "backups").iterdir())


def seed(settings, *names: str) -> None:
    backups = settings.data_dir / "backups"
    backups.mkdir(parents=True, exist_ok=True)
    for n in names:
        (backups / n).write_bytes(b"x")
    sqlite3.connect(migrate.db_path(settings)).close()


def test_retries_from_the_same_version_keep_the_first_backup(settings):
    first = "mygolfviz-20260101T000000Z-0001.sqlite3"
    seed(
        settings,
        first,
        "mygolfviz-20260102T000000Z-0001.sqlite3",
        "mygolfviz-20260103T000000Z-0001.sqlite3",
    )
    newest = migrate.backup_database(settings, "0001")
    # The first copy is the true pre-upgrade one; the latest is kept too. Retries in between go.
    assert backup_names(settings) == [first, newest.name]


def test_retries_never_push_out_other_versions_backups(settings):
    older = [f"mygolfviz-2025010{i}T000000Z-r{i}.sqlite3" for i in range(1, 5)]
    seed(settings, *older)
    for _ in range(8):
        migrate.backup_database(settings, "0001")
    names = backup_names(settings)
    for n in older:
        assert n in names
    assert len([n for n in names if n.endswith("-0001.sqlite3")]) <= 2


def test_keeps_backups_for_the_five_most_recent_versions(settings):
    seed(settings, *[f"mygolfviz-2025010{i}T000000Z-r{i}.sqlite3" for i in range(1, 7)])
    migrate.backup_database(settings, None)
    names = backup_names(settings)
    revs = {n.rsplit("-", 1)[1] for n in names}
    assert revs == {"r3.sqlite3", "r4.sqlite3", "r5.sqlite3", "r6.sqlite3", "none.sqlite3"}


def test_files_that_are_not_backups_are_left_alone(settings):
    seed(settings, "notes.txt", *[f"mygolfviz-2025010{i}T000000Z-r{i}.sqlite3" for i in range(1, 7)])
    migrate.backup_database(settings, None)
    assert "notes.txt" in backup_names(settings)


def test_on_migrating_is_called_before_upgrading_an_older_database(settings):
    make_stale_db(settings)
    seen: list[set[str]] = []
    migrate.upgrade(settings, on_migrating=lambda: seen.append(tables(migrate.db_path(settings))))
    assert len(seen) == 1
    assert "sessions" not in seen[0]  # called before the upgrade ran


def test_on_migrating_is_not_called_for_a_new_or_current_database(settings):
    calls: list[int] = []
    migrate.upgrade(settings, on_migrating=lambda: calls.append(1))  # brand-new database
    migrate.upgrade(settings, on_migrating=lambda: calls.append(1))  # already current
    assert calls == []


def test_models_match_the_migrations(settings):
    migrate.upgrade(settings)
    engine = create_engine(f"sqlite:///{migrate.db_path(settings)}")
    try:
        with engine.connect() as con:
            diff = compare_metadata(MigrationContext.configure(con), Base.metadata)
    finally:
        engine.dispose()
    assert diff == [], f"models.py and the migrations disagree; add a migration: {diff}"


def test_new_constraints_get_predictable_names():
    # So a later migration can alter them by name (see migrations/README.md).
    names = {c.name for c in Base.metadata.tables["imports"].constraints if c.name}
    assert "uq_imports_session_id_sha256" in names
    assert "fk_imports_session_id_sessions" in names
