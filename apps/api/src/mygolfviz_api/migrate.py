from __future__ import annotations

import logging
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine

from .config import Settings

KEEP_BACKUPS = 5

logger = logging.getLogger(__name__)


def db_path(settings: Settings) -> Path:
    return settings.data_dir / "mygolfviz.sqlite3"


def make_config(settings: Settings) -> Config:
    cfg = Config()
    cfg.set_main_option("script_location", str(Path(__file__).parent / "migrations"))
    cfg.attributes["db_path"] = db_path(settings)
    return cfg


def current_revision(settings: Settings) -> str | None:
    engine = create_engine(f"sqlite:///{db_path(settings)}")
    try:
        with engine.connect() as con:
            return MigrationContext.configure(con).get_current_revision()
    finally:
        engine.dispose()


def backup_database(settings: Settings, from_rev: str | None) -> Path:
    backups = settings.data_dir / "backups"
    backups.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    dest = backups / f"mygolfviz-{stamp}-{from_rev or 'none'}.sqlite3"
    src = sqlite3.connect(db_path(settings))
    dst = sqlite3.connect(dest)
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()
    for old in sorted(backups.glob("mygolfviz-*.sqlite3"))[:-KEEP_BACKUPS]:
        old.unlink()
    return dest


def upgrade(settings: Settings) -> str:
    try:
        cfg = make_config(settings)
        head = ScriptDirectory.from_config(cfg).get_current_head()
        assert head is not None
        if db_path(settings).exists():
            current = current_revision(settings)
            if current != head:
                dest = backup_database(settings, current)
                logger.info("migration backup written to %s", dest)
        command.upgrade(cfg, "head")
    except Exception:
        logger.exception("migration failed")
        raise
    return head
