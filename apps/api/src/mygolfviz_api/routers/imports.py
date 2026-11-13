from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession

from .. import models
from ..config import KNOWN_PARSER_VERSIONS
from ..db import session_scope
from ..queries import session_row, utc_now
from ..schemas import (
    CheckRequest,
    CheckResponse,
    CheckResult,
    FileResult,
    ImportFileIn,
    ImportManifestIn,
    ImportResponse,
    SessionRef,
)
from ..storage import STORE_LOCK, OriginalStore

MAX_MANIFEST_BYTES = 64 * 1024 * 1024

router = APIRouter(prefix="/api/v1")


def insert_shots(db: DbSession, import_id: str, shots: list) -> None:
    db.add_all(
        models.Shot(
            id=str(uuid.uuid4()),
            import_id=import_id,
            source_row=s.source_row,
            shot_label=s.shot_label,
            club=s.club,
            shot_type=s.shot_type,
            mode=s.mode,
            location=s.location,
            measurements=s.m.model_dump(),
            raw=s.raw,
            flags=list(s.flags),
        )
        for s in shots
    )


def _first_error(e: ValidationError) -> str:
    err = e.errors()[0]
    loc = ".".join(str(x) for x in err["loc"])
    return f"{loc}: {err['msg']}"


def _process_file(
    request: Request,
    session_id: str,
    raw: dict,
    data: bytes | None,
) -> FileResult:
    engine = request.app.state.engine
    store: OriginalStore = request.app.state.originals
    field = str(raw.get("field", ""))
    name = str(raw.get("name", ""))

    def invalid(reason: str) -> FileResult:
        return FileResult(field=field, name=name, status="invalid", reason=reason)

    try:
        f = ImportFileIn.model_validate(raw)
    except ValidationError as e:
        return invalid(_first_error(e))
    if data is None:
        return invalid("missing_file")
    if f.parser_version not in KNOWN_PARSER_VERSIONS:
        return invalid("unknown_parser_version")
    if not f.shots:
        return invalid("no_shots")
    rows = [s.source_row for s in f.shots]
    if len(set(rows)) != len(rows):
        return invalid("duplicate_source_row")

    import hashlib

    sha = hashlib.sha256(data).hexdigest()
    warnings = [w.model_dump(exclude_none=True) for w in f.warnings]

    with STORE_LOCK:
        with session_scope(engine) as db:
            if db.scalar(
                select(models.Import.id).where(
                    models.Import.session_id == session_id, models.Import.sha256 == sha
                )
            ):
                return FileResult(field=f.field, name=f.name, status="skipped_duplicate")
            elsewhere = db.scalar(
                select(models.Import.id).where(
                    models.Import.session_id != session_id, models.Import.sha256 == sha
                ).limit(1)
            )
        if elsewhere and not f.accept_cross_session_duplicate:
            return invalid("in_other_session")

        created = False
        try:
            sha, created = store.put(data)
            with session_scope(engine) as db:
                ordinal = (
                    db.scalar(
                        select(func.max(models.Import.ordinal)).where(
                            models.Import.session_id == session_id
                        )
                    )
                    or 0
                ) + 1
                imp = models.Import(
                    id=str(uuid.uuid4()),
                    session_id=session_id,
                    original_filename=f.name,
                    display_name=None,
                    sha256=sha,
                    byte_length=len(data),
                    ordinal=ordinal,
                    parser_version=f.parser_version,
                    shot_count=len(f.shots),
                    summary_row_count=f.summary_row_count,
                    warnings=warnings,
                    imported_at=utc_now(),
                )
                db.add(imp)
                db.flush()
                insert_shots(db, imp.id, f.shots)
                import_id = imp.id
        except Exception:
            if created:
                with session_scope(engine) as db:
                    store.delete_if_unreferenced(db, sha)
            return invalid("storage_error")
        return FileResult(
            field=f.field,
            name=f.name,
            status="imported",
            import_id=import_id,
            shot_count=len(f.shots),
            warnings=warnings,
        )


def _run(request: Request, manifest: ImportManifestIn, blobs: dict[str, bytes]) -> ImportResponse:
    engine = request.app.state.engine
    dest = manifest.destination
    with session_scope(engine) as db:
        if dest.new_session is not None:
            now = utc_now()
            s = models.Session(
                id=str(uuid.uuid4()),
                name=dest.new_session.name,
                date=dest.new_session.date,
                notes=dest.new_session.notes,
                handedness=dest.new_session.handedness,
                created_at=now,
                updated_at=now,
            )
            db.add(s)
            db.flush()
            session_id = s.id
        else:
            if db.get(models.Session, dest.session_id) is None:
                raise HTTPException(404, "session not found")
            session_id = dest.session_id  # type: ignore[assignment]
    results = [
        _process_file(request, session_id, raw, blobs.get(str(raw.get("field", ""))))
        for raw in manifest.files
    ]
    with session_scope(engine) as db:
        s = db.get(models.Session, session_id)
        return ImportResponse(session=session_row(db, s), results=results)


@router.post("/imports", response_model=ImportResponse)
async def commit_imports(request: Request) -> ImportResponse:
    form = await request.form(max_part_size=MAX_MANIFEST_BYTES)
    raw_manifest = form.get("manifest")
    if not isinstance(raw_manifest, str):
        raise HTTPException(422, "manifest field is required")
    try:
        manifest = ImportManifestIn.model_validate(json.loads(raw_manifest))
    except (ValueError, ValidationError) as e:
        raise HTTPException(422, f"invalid manifest: {e}") from None
    blobs: dict[str, bytes] = {}
    for key, value in form.multi_items():
        if key != "manifest" and hasattr(value, "read"):
            blobs[key] = await value.read()
    return await run_in_threadpool(_run, request, manifest, blobs)


@router.post("/imports/check", response_model=CheckResponse)
def check_imports(body: CheckRequest, request: Request) -> CheckResponse:
    results = []
    with session_scope(request.app.state.engine) as db:
        for sha in body.sha256s:
            rows = db.execute(
                select(models.Session.id, models.Session.name)
                .join(models.Import, models.Import.session_id == models.Session.id)
                .where(models.Import.sha256 == sha)
                .distinct()
                .order_by(models.Session.created_at, models.Session.id)
            ).all()
            results.append(
                CheckResult(
                    sha256=sha,
                    in_destination=any(r[0] == body.session_id for r in rows),
                    other_sessions=[
                        SessionRef(id=r[0], name=r[1]) for r in rows if r[0] != body.session_id
                    ],
                )
            )
    return CheckResponse(results=results)
