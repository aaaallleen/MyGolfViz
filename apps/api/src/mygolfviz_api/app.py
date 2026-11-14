from __future__ import annotations

import logging
import re
from collections.abc import Callable
from contextlib import asynccontextmanager
from logging.handlers import RotatingFileHandler

from fastapi import FastAPI
from sqlalchemy import text

from . import __version__
from .config import Settings
from .db import make_engine, session_scope
from .migrate import db_path, upgrade
from .routers import imports as imports_router
from .routers import library as library_router
from .routers import sessions as sessions_router
from .routers import shots as shots_router
from .security import SecurityMiddleware
from .static import install_static
from .storage import OriginalStore


_TOKEN_RE = re.compile(r"(token=)[^&\s\"]+")


class RedactTokenFilter(logging.Filter):
    """Replace any ``token=<value>`` in log messages with ``token=REDACTED``."""

    def filter(self, record: logging.LogRecord) -> bool:
        # Redact inside msg and each argument rather than merging them: uvicorn's access formatter
        # unpacks record.args, so the arguments must keep their shape.
        if isinstance(record.msg, str):
            record.msg = _redact(record.msg)
        if isinstance(record.args, tuple):
            record.args = tuple(_redact_arg(a) for a in record.args)
        elif isinstance(record.args, dict):
            record.args = {k: _redact_arg(v) for k, v in record.args.items()}
        return True


def _redact(text: str) -> str:
    return _TOKEN_RE.sub(r"\1REDACTED", text)


def _redact_arg(value: object) -> object:
    if isinstance(value, str):
        return _redact(value)
    # Anything else that would print the token is replaced by its redacted text.
    text = str(value)
    return _redact(text) if _TOKEN_RE.search(text) else value


def attach_log_handler(settings: Settings) -> None:
    path = (settings.data_dir / "logs" / "mygolfviz-api.log").resolve()
    for name in ("mygolfviz_api", "uvicorn", "uvicorn.access"):
        logger = logging.getLogger(name)
        if any(
            isinstance(h, RotatingFileHandler) and h.baseFilename == str(path)
            for h in logger.handlers
        ):
            continue
        handler = RotatingFileHandler(
            path, maxBytes=1_000_000, backupCount=3, encoding="utf-8"
        )
        handler.addFilter(RedactTokenFilter())
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
        )
        logger.addHandler(handler)
        # uvicorn.access does not propagate; redact at the logger too so its
        # console handler never prints the token either.
        if not any(isinstance(f, RedactTokenFilter) for f in logger.filters):
            logger.addFilter(RedactTokenFilter())
        if logger.level == logging.NOTSET or logger.level > logging.INFO:
            logger.setLevel(logging.INFO)


def create_app(settings: Settings, on_migrating: Callable[[], None] | None = None) -> FastAPI:
    for sub in ("originals", "backups", "logs"):
        (settings.data_dir / sub).mkdir(parents=True, exist_ok=True)
    attach_log_handler(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        yield
        # Fold the WAL into the main file so a quit never leaves data only in -wal.
        try:
            with app.state.engine.connect() as con:
                con.execute(text("PRAGMA wal_checkpoint(TRUNCATE)"))
        finally:
            app.state.engine.dispose()

    app = FastAPI(title="MyGolfViz API", docs_url=None, redoc_url=None, lifespan=lifespan)
    app.state.settings = settings
    app.state.schema_version = upgrade(settings, on_migrating)
    app.state.engine = make_engine(db_path(settings))
    app.state.originals = OriginalStore(settings.data_dir)
    with session_scope(app.state.engine) as db:
        app.state.originals.sweep(db)

    app.add_middleware(
        SecurityMiddleware,
        token=settings.token,
        allowed_hosts=settings.resolved_allowed_hosts(),
    )

    app.include_router(imports_router.router)
    app.include_router(sessions_router.router)
    app.include_router(shots_router.router)
    app.include_router(library_router.router)

    @app.get("/api/v1/health")
    def health() -> dict:
        return {"status": "ok", "appVersion": __version__, "schemaVersion": app.state.schema_version}

    install_static(app, settings.static_dir)

    return app
