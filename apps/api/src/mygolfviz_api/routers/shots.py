from __future__ import annotations

from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Request, Response
from sqlalchemy import select

from .. import models
from ..db import session_scope
from ..queries import excluded_shot_ids, import_row, renumber, shot_out, touch, utc_now
from ..schemas import ExclusionsIn, ExclusionsOut, ImportPatch, ImportRow, ShotOut
from ..storage import STORE_LOCK
from .sessions import get_session_or_404, not_found

router = APIRouter(prefix="/api/v1")


@router.get("/sessions/{session_id}/shots", response_model=list[ShotOut])
def list_shots(session_id: str, request: Request) -> list[ShotOut]:
    with session_scope(request.app.state.engine) as db:
        get_session_or_404(db, session_id)
        excluded = {
            (sha, row)
            for sha, row in db.execute(
                select(models.Exclusion.sha256, models.Exclusion.source_row).where(
                    models.Exclusion.session_id == session_id
                )
            )
        }
        rows = db.execute(
            select(models.Shot, models.Import.sha256)
            .join(models.Import, models.Import.id == models.Shot.import_id)
            .where(models.Import.session_id == session_id)
            .order_by(models.Import.ordinal, models.Shot.source_row)
        ).all()
        return [
            shot_out(s, (sha, s.source_row) in excluded)
            for s, sha in rows
        ]


@router.patch("/sessions/{session_id}/exclusions", response_model=ExclusionsOut)
def patch_exclusions(session_id: str, body: ExclusionsIn, request: Request) -> ExclusionsOut:
    with session_scope(request.app.state.engine) as db:
        get_session_or_404(db, session_id)
        wanted = set(body.exclude) | set(body.include)
        found = {
            sid: (sha, row)
            for sid, sha, row in db.execute(
                select(models.Shot.id, models.Import.sha256, models.Shot.source_row)
                .join(models.Import, models.Import.id == models.Shot.import_id)
                .where(models.Import.session_id == session_id, models.Shot.id.in_(wanted))
            )
        }
        if set(found) != wanted:
            raise HTTPException(422, "shot ids not in this session")
        now = utc_now()
        # include wins over exclude only by order: apply exclude, then include.
        for sid in body.exclude:
            sha, row = found[sid]
            if db.get(models.Exclusion, (session_id, sha, row)) is None:
                db.add(
                    models.Exclusion(
                        session_id=session_id, sha256=sha, source_row=row, excluded_at=now
                    )
                )
        db.flush()
        for sid in body.include:
            sha, row = found[sid]
            ex = db.get(models.Exclusion, (session_id, sha, row))
            if ex is not None:
                db.delete(ex)
        db.flush()
        touch(db, session_id)
        db.flush()
        return ExclusionsOut(excluded_shot_ids=excluded_shot_ids(db, session_id))


def _get_import(db, import_id: str) -> models.Import:
    imp = db.get(models.Import, import_id)
    if imp is None:
        raise not_found()
    return imp


@router.patch("/imports/{import_id}", response_model=ImportRow)
def patch_import(import_id: str, body: ImportPatch, request: Request) -> ImportRow:
    with session_scope(request.app.state.engine) as db:
        imp = _get_import(db, import_id)
        name = body.display_name.strip() if body.display_name is not None else None
        imp.display_name = name or None
        touch(db, imp.session_id)
        db.flush()
        return import_row(imp)


@router.delete("/imports/{import_id}", status_code=204)
def delete_import(import_id: str, request: Request) -> None:
    store = request.app.state.originals
    with STORE_LOCK:
        with session_scope(request.app.state.engine) as db:
            imp = _get_import(db, import_id)
            session_id, sha = imp.session_id, imp.sha256
            db.delete(imp)
            db.flush()
            renumber(db, session_id)
            touch(db, session_id)
            db.flush()
        store.delete_unreferenced_after_commit(request.app.state.engine, {sha})


@router.get("/imports/{import_id}/original")
def download_original(import_id: str, request: Request) -> Response:
    with session_scope(request.app.state.engine) as db:
        imp = _get_import(db, import_id)
        name, sha = imp.original_filename, imp.sha256
    path = request.app.state.originals.path(sha)
    try:
        data = path.read_bytes()
    except FileNotFoundError:
        raise not_found() from None
    fallback = "".join(c if c.isascii() and c.isprintable() and c not in '"\\' else "_" for c in name)
    disp = f"attachment; filename=\"{fallback}\"; filename*=UTF-8''{quote(name, safe='')}"
    return Response(data, media_type="text/csv", headers={"Content-Disposition": disp})
