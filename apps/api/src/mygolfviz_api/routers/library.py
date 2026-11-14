from __future__ import annotations

from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Path, Query, Request, Response
from sqlalchemy import select

from .. import models
from ..db import session_scope
from ..queries import utc_now
from ..schemas import (
    LibraryShot,
    SettingIn,
    SettingOut,
    TargetRangeIn,
    TargetRangeOut,
)

router = APIRouter(prefix="/api/v1")

SettingKey = Annotated[str, Path(pattern=r"^[a-z][a-z0-9_.-]{0,63}$")]


@router.get("/shots", response_model=list[LibraryShot])
def list_library_shots(
    request: Request,
    club: str | None = None,
    session_ids: Annotated[list[str] | None, Query()] = None,
) -> list[LibraryShot]:
    with session_scope(request.app.state.engine) as db:
        q = (
            select(models.Shot, models.Import, models.Session)
            .join(models.Import, models.Import.id == models.Shot.import_id)
            .join(models.Session, models.Session.id == models.Import.session_id)
            .order_by(
                models.Session.date,
                models.Session.created_at,
                models.Import.ordinal,
                models.Shot.source_row,
            )
        )
        if club is not None:
            q = q.where(models.Shot.club == club)
        if session_ids:
            q = q.where(models.Session.id.in_(session_ids))
        excluded = {
            (sid, sha, row)
            for sid, sha, row in db.execute(
                select(
                    models.Exclusion.session_id,
                    models.Exclusion.sha256,
                    models.Exclusion.source_row,
                )
            )
        }
        return [
            LibraryShot(
                id=s.id,
                session_id=sess.id,
                import_id=imp.id,
                source_row=s.source_row,
                shot_label=s.shot_label,
                club=s.club,
                m=s.measurements,
                excluded=(sess.id, imp.sha256, s.source_row) in excluded,
            )
            for s, imp, sess in db.execute(q).all()
        ]


def _setting_out(row: models.Setting) -> SettingOut:
    return SettingOut(key=row.key, value=row.value, updated_at=row.updated_at)


@router.get("/settings/{key}", response_model=SettingOut)
def get_setting(key: SettingKey, request: Request) -> SettingOut:
    with session_scope(request.app.state.engine) as db:
        row = db.get(models.Setting, key)
        if row is None:
            raise HTTPException(404, "setting not set")
        return _setting_out(row)


@router.put("/settings/{key}", response_model=SettingOut)
def put_setting(key: SettingKey, body: SettingIn, request: Request) -> SettingOut:
    with session_scope(request.app.state.engine) as db:
        row = db.get(models.Setting, key)
        now = utc_now()
        if row is None:
            row = models.Setting(key=key, value=body.value, updated_at=now)
            db.add(row)
        else:
            row.value = body.value
            row.updated_at = now
        db.flush()
        return _setting_out(row)


def _range_out(r: models.TargetRange) -> TargetRangeOut:
    return TargetRangeOut(
        id=r.id, club=r.club, metric=r.metric, low=r.low, high=r.high, updated_at=r.updated_at
    )


@router.get("/target-ranges", response_model=list[TargetRangeOut])
def list_target_ranges(request: Request, club: str | None = None) -> list[TargetRangeOut]:
    with session_scope(request.app.state.engine) as db:
        q = select(models.TargetRange).order_by(models.TargetRange.club, models.TargetRange.metric)
        if club is not None:
            q = q.where(models.TargetRange.club == club)
        return [_range_out(r) for r in db.scalars(q)]


@router.put("/target-ranges", response_model=TargetRangeOut)
def put_target_range(body: TargetRangeIn, request: Request) -> TargetRangeOut:
    with session_scope(request.app.state.engine) as db:
        row = db.scalar(
            select(models.TargetRange).where(
                models.TargetRange.club == body.club, models.TargetRange.metric == body.metric
            )
        )
        now = utc_now()
        if row is None:
            row = models.TargetRange(
                id=str(uuid4()),
                club=body.club,
                metric=body.metric,
                low=body.low,
                high=body.high,
                updated_at=now,
            )
            db.add(row)
        else:
            row.low, row.high, row.updated_at = body.low, body.high, now
        db.flush()
        return _range_out(row)


@router.delete("/target-ranges/{range_id}", status_code=204)
def delete_target_range(range_id: str, request: Request) -> Response:
    with session_scope(request.app.state.engine) as db:
        row = db.get(models.TargetRange, range_id)
        if row is None:
            raise HTTPException(404, "target range not found")
        db.delete(row)
    return Response(status_code=204)
