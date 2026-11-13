from __future__ import annotations

import logging
import re
import sqlite3
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine

from .config import Settings

# Backups are kept for this many database versions (the version a backup was
# taken from). For each version the first backup (the true pre-upgrade copy)
# and the latest one are kept, so repeated attempts at one upgrade can never
# push out the original or other versions' backups.
KEEP_BACKUPS = 5
BACKUP_NAME = re.compile(r"^mygolfviz-(\d{8}T\d{6})(?:\.(\d{6}))?Z-(.+)\.sqlite3$")

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
    # Microseconds keep two backups from the same second from overwriting each other.
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    dest = backups / f"mygolfviz-{stamp}-{from_rev or 'none'}.sqlite3"
    src = sqlite3.connect(db_path(settings))
    dst = sqlite3.connect(dest)
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()
    prune_backups(backups)
    return dest


def prune_backups(backups: Path) -> None:
    by_rev: dict[str, list[tuple[str, Path]]] = {}
    for path in backups.iterdir():
        m = BACKUP_NAME.match(path.name)
        if m:
            when = f"{m.group(1)}.{m.group(2) or '000000'}"
            by_rev.setdefault(m.group(3), []).append((when, path))
    groups = sorted(by_rev.values(), key=lambda g: max(g)[0], reverse=True)
    keep: set[Path] = set()
    for group in groups[:KEEP_BACKUPS]:
        group.sort()
        keep.update({group[0][1], group[-1][1]})
    for group in groups:
        for _, path in group:
            if path not in keep:
                path.unlink()


def upgrade(settings: Settings, on_migrating: Callable[[], None] | None = None) -> str:
    """Bring the database to the latest schema. `on_migrating` is called before
    an existing database is backed up and upgraded (never for a new or current
    one), so a caller can say that startup will take longer than usual."""
    try:
        cfg = make_config(settings)
        head = ScriptDirectory.from_config(cfg).get_current_head()
        assert head is not None
        if db_path(settings).exists():
            current = current_revision(settings)
            if current != head:
                if on_migrating is not None:
                    on_migrating()
                dest = backup_database(settings, current)
                logger.info("migration backup written to %s", dest)
        command.upgrade(cfg, "head")
    except Exception:
        logger.exception("migration failed")
        raise
    return head
