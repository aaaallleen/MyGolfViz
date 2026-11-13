from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import select

from .. import models
from ..db import session_scope
from ..queries import import_row, renumber, session_imports, session_row, touch, utc_now
from ..schemas import ImportOrderIn, ImportRow, SessionDetail, SessionIn, SessionPatch, SessionRow
from ..storage import STORE_LOCK

router = APIRouter(prefix="/api/v1")


def not_found() -> HTTPException:
    return HTTPException(404, "Not found")


def get_session_or_404(db, session_id: str) -> models.Session:
    s = db.get(models.Session, session_id)
    if s is None:
        raise not_found()
    return s


@router.get("/sessions", response_model=list[SessionRow])
def list_sessions(request: Request) -> list[SessionRow]:
    with session_scope(request.app.state.engine) as db:
        rows = db.scalars(
            select(models.Session).order_by(models.Session.date.desc(), models.Session.created_at.desc())
        ).all()
        return [session_row(db, s) for s in rows]


@router.post("/sessions", response_model=SessionRow, status_code=201)
def create_session(body: SessionIn, request: Request) -> SessionRow:
    with session_scope(request.app.state.engine) as db:
        now = utc_now()
        s = models.Session(
            id=str(uuid.uuid4()),
            name=body.name,
            date=body.date,
            notes=body.notes,
            handedness=body.handedness,
            created_at=now,
            updated_at=now,
        )
        db.add(s)
        db.flush()
        return session_row(db, s)


@router.get("/sessions/{session_id}", response_model=SessionDetail)
def get_session(session_id: str, request: Request) -> SessionDetail:
    with session_scope(request.app.state.engine) as db:
        s = get_session_or_404(db, session_id)
        return SessionDetail(
            session=session_row(db, s),
            imports=[import_row(i) for i in session_imports(db, session_id)],
        )


@router.patch("/sessions/{session_id}", response_model=SessionRow)
def patch_session(session_id: str, body: SessionPatch, request: Request) -> SessionRow:
    with session_scope(request.app.state.engine) as db:
        s = get_session_or_404(db, session_id)
        for field in body.model_fields_set:
            setattr(s, field, getattr(body, field))
        s.updated_at = utc_now()
        db.flush()
        return session_row(db, s)


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(session_id: str, request: Request) -> None:
    store = request.app.state.originals
    with STORE_LOCK:
        with session_scope(request.app.state.engine) as db:
            s = get_session_or_404(db, session_id)
            shas = set(
                db.scalars(select(models.Import.sha256).where(models.Import.session_id == session_id))
            )
            db.delete(s)
            db.flush()
            for sha in shas:
                store.delete_if_unreferenced(db, sha)


@router.get("/sessions/{session_id}/imports", response_model=list[ImportRow])
def list_imports(session_id: str, request: Request) -> list[ImportRow]:
    with session_scope(request.app.state.engine) as db:
        get_session_or_404(db, session_id)
        return [import_row(i) for i in session_imports(db, session_id)]


@router.patch("/sessions/{session_id}/imports/order", response_model=list[ImportRow])
def reorder_imports(session_id: str, body: ImportOrderIn, request: Request) -> list[ImportRow]:
    with STORE_LOCK:
        with session_scope(request.app.state.engine) as db:
            get_session_or_404(db, session_id)
            current = {i.id: i for i in session_imports(db, session_id)}
            ids = body.import_ids
            if len(ids) != len(set(ids)) or set(ids) != set(current):
                raise HTTPException(422, "importIds must be exactly the session's imports")
            renumber(db, session_id, [current[i] for i in ids])
            touch(db, session_id)
            db.flush()
            return [import_row(i) for i in session_imports(db, session_id)]
