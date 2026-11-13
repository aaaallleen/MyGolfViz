from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession

from . import models
from .schemas import ClubCount, SessionRow


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def session_row(db: DbSession, s: models.Session) -> SessionRow:
    file_count = db.scalar(
        select(func.count()).select_from(models.Import).where(models.Import.session_id == s.id)
    )
    clubs: dict[str, int] = {}
    rows = db.execute(
        select(models.Shot.club)
        .join(models.Import, models.Import.id == models.Shot.import_id)
        .where(models.Import.session_id == s.id)
        .order_by(models.Import.ordinal, models.Shot.source_row)
    )
    for (club,) in rows:
        clubs[club] = clubs.get(club, 0) + 1
    return SessionRow(
        id=s.id,
        name=s.name,
        date=s.date,
        notes=s.notes or "",
        handedness=s.handedness or "right",
        created_at=s.created_at,
        updated_at=s.updated_at,
        shot_count=sum(clubs.values()),
        file_count=file_count or 0,
        clubs=[ClubCount(club=c, count=n) for c, n in clubs.items()],
    )
