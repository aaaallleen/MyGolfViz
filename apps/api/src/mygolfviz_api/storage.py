from __future__ import annotations

import hashlib
import os
import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from . import models


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
            if target.exists():
                tmp.unlink()
                return sha, False
            os.replace(tmp, target)
        except BaseException:
            tmp.unlink(missing_ok=True)
            raise
        return sha, True

    def _referenced(self, db: DbSession, sha: str) -> bool:
        return (
            db.scalar(select(models.Import.id).where(models.Import.sha256 == sha).limit(1))
            is not None
        )

    def delete_if_unreferenced(self, db: DbSession, sha: str) -> bool:
        if self._referenced(db, sha):
            return False
        self.path(sha).unlink(missing_ok=True)
        return True

    def sweep(self, db: DbSession) -> int:
        referenced = set(db.scalars(select(models.Import.sha256).distinct()).all())
        removed = 0
        for p in self.dir.iterdir():
            if p.name.startswith(".tmp-") or (
                p.suffix == ".csv" and p.stem not in referenced
            ):
                p.unlink(missing_ok=True)
                removed += 1
        return removed
