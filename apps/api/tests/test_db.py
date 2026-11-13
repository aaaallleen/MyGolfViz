import sqlite3

from alembic import command
from sqlalchemy import select, text

from mygolfviz_api import migrate, models
from mygolfviz_api.db import make_engine, session_scope


def test_fresh_db_migrates_to_head_without_backup(settings, client):
    assert list((settings.data_dir / "backups").iterdir()) == []
    assert client.get("/api/v1/health").json()["schemaVersion"] == "0001"


def test_pending_migration_backs_up_first(settings):
    (settings.data_dir / "backups").mkdir(parents=True, exist_ok=True)
    command.stamp(migrate.make_config(settings), "base")
    con = sqlite3.connect(settings.data_dir / "mygolfviz.sqlite3")
    con.execute("create table legacy (x integer)")
    con.commit()
    con.close()
    assert migrate.upgrade(settings) == "0001"
    backups = list((settings.data_dir / "backups").iterdir())
    assert len(backups) == 1
    assert backups[0].name.endswith("-none.sqlite3")
    sqlite3.connect(backups[0]).execute("select * from legacy").fetchall()


def test_keeps_five_backups(settings):
    backups = settings.data_dir / "backups"
    backups.mkdir(parents=True, exist_ok=True)
    for i in range(6):
        (backups / f"mygolfviz-2020010{i}T000000Z-none.sqlite3").write_bytes(b"x")
    sqlite3.connect(settings.data_dir / "mygolfviz.sqlite3").close()
    migrate.backup_database(settings, None)
    names = sorted(p.name for p in backups.iterdir())
    assert len(names) == 5
    assert "mygolfviz-20200100T000000Z-none.sqlite3" not in names
    assert "mygolfviz-20200101T000000Z-none.sqlite3" not in names


def test_pragmas(tmp_path):
    engine = make_engine(tmp_path / "p.sqlite3")
    with engine.connect() as c:
        assert c.execute(text("PRAGMA foreign_keys")).scalar() == 1
        assert c.execute(text("PRAGMA journal_mode")).scalar() == "wal"
        assert c.execute(text("PRAGMA busy_timeout")).scalar() == 5000


def test_cascade_session_delete(settings):
    migrate.upgrade(settings)
    engine = make_engine(settings.data_dir / "mygolfviz.sqlite3")
    now = "2026-01-01T00:00:00Z"
    with session_scope(engine) as s:
        s.add(models.Session(id="s", name="n", date="2026-01-01", created_at=now, updated_at=now))
        s.flush()
        s.add(models.Import(id="i", session_id="s", original_filename="a.csv", sha256="h",
                            byte_length=1, ordinal=0, parser_version="1.0.0", shot_count=1,
                            summary_row_count=0, warnings=[], imported_at=now))
        s.flush()
        s.add(models.Shot(id="sh", import_id="i", source_row=1, measurements={}, raw={}, flags={}))
        s.add(models.Exclusion(session_id="s", sha256="h", source_row=1, excluded_at=now))
    with session_scope(engine) as s:
        s.delete(s.get(models.Session, "s"))
    with session_scope(engine) as s:
        for m in (models.Session, models.Import, models.Shot, models.Exclusion):
            assert s.scalars(select(m)).all() == []
