from __future__ import annotations

import hashlib
import fcntl
import logging
import os
import threading
import uuid
from pathlib import Path

from sqlalchemy import Engine, select
from sqlalchemy.orm import Session as DbSession

from . import models
from .db import session_scope

log = logging.getLogger(__name__)


# One process-wide lock: the backend is single-user and single-process. Held by the import
# path across duplicate check, put, ordinal read, insert and cleanup.
STORE_LOCK = threading.RLock()


class OriginalStore:
    def __init__(self, data_dir: Path) -> None:
        self.dir = Path(data_dir) / "originals"
        self.dir.mkdir(parents=True, exist_ok=True)

    def path(self, sha: str) -> Path:
        return self.dir / f"{sha}.csv"

    def put(self, data: bytes) -> tuple[str, bool]:
        sha = hashlib.sha256(data).hexdigest()
        target = self.path(sha)
        if target.exists():
            return sha, False
        tmp = self.dir / f".tmp-{uuid.uuid4()}"
        try:
            with open(tmp, "wb") as f:
                f.write(data)
                f.flush()
                os.fsync(f.fileno())
                if hasattr(fcntl, "F_FULLFSYNC"):  # macOS: plain fsync does not reach the platter
                    fcntl.fcntl(f.fileno(), fcntl.F_FULLFSYNC)
            if target.exists():
                tmp.unlink()
                return sha, False
            os.replace(tmp, target)
            self._fsync_dir()
        except BaseException:
            tmp.unlink(missing_ok=True)
            raise
        return sha, True

    def _fsync_dir(self) -> None:
        """Make the rename durable. Some filesystems refuse a directory fsync; that is fine."""
        try:
            fd = os.open(self.dir, os.O_RDONLY)
        except OSError:
            return
        try:
            os.fsync(fd)
        except OSError:
            pass
        finally:
            os.close(fd)

    def _referenced(self, db: DbSession, sha: str) -> bool:
        return (
            db.scalar(select(models.Import.id).where(models.Import.sha256 == sha).limit(1))
            is not None
        )

    def delete_if_unreferenced(self, db: DbSession, sha: str) -> bool:
        with STORE_LOCK:
            if self._referenced(db, sha):
                return False
            self.path(sha).unlink(missing_ok=True)
            return True

    def delete_unreferenced_after_commit(self, engine: Engine, shas: set[str]) -> None:
        """Call after the transaction that dropped the references has committed.

        Deleting before the commit could leave a DB row pointing at a missing file if the
        commit failed. A failure here only leaves an orphan, which the startup sweep removes.
        """
        with STORE_LOCK:
            try:
                with session_scope(engine) as db:
                    for sha in shas:
                        self.delete_if_unreferenced(db, sha)
            except Exception:
                log.exception("could not delete unreferenced originals; startup sweep will retry")

    def sweep(self, db: DbSession) -> int:
        with STORE_LOCK:
            referenced = set(db.scalars(select(models.Import.sha256).distinct()).all())
            removed = 0
            for p in self.dir.iterdir():
                if p.name.startswith(".tmp-") or (
                    p.suffix == ".csv" and p.stem not in referenced
                ):
                    p.unlink(missing_ok=True)
                    removed += 1
            return removed
