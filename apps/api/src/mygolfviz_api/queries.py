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


def import_row(i: models.Import):
    from .schemas import ImportRow

    return ImportRow(
        id=i.id,
        session_id=i.session_id,
        original_filename=i.original_filename,
        display_name=i.display_name,
        sha256=i.sha256,
        byte_length=i.byte_length,
        ordinal=i.ordinal,
        parser_version=i.parser_version,
        shot_count=i.shot_count,
        summary_row_count=i.summary_row_count,
        warnings=list(i.warnings or []),
        imported_at=i.imported_at,
    )


def session_imports(db: DbSession, session_id: str) -> list[models.Import]:
    return list(
        db.scalars(
            select(models.Import)
            .where(models.Import.session_id == session_id)
            .order_by(models.Import.ordinal)
        )
    )


def renumber(db: DbSession, session_id: str, ordered: list[models.Import] | None = None) -> None:
    """Renumber a session's imports to 1..n (via negatives is unnecessary: no unique on ordinal)."""
    for n, imp in enumerate(ordered or session_imports(db, session_id), start=1):
        imp.ordinal = n


def touch(db: DbSession, session_id: str) -> None:
    s = db.get(models.Session, session_id)
    if s is not None:
        s.updated_at = utc_now()


def excluded_shot_ids(db: DbSession, session_id: str) -> list[str]:
    return list(
        db.scalars(
            select(models.Shot.id)
            .join(models.Import, models.Import.id == models.Shot.import_id)
            .join(
                models.Exclusion,
                (models.Exclusion.session_id == models.Import.session_id)
                & (models.Exclusion.sha256 == models.Import.sha256)
                & (models.Exclusion.source_row == models.Shot.source_row),
            )
            .where(models.Import.session_id == session_id)
            .order_by(models.Import.ordinal, models.Shot.source_row)
        )
    )
