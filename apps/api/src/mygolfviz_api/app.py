from __future__ import annotations

import logging
from logging.handlers import RotatingFileHandler

from fastapi import FastAPI

from . import __version__
from .config import Settings
from .db import make_engine
from .migrate import db_path, upgrade
from .security import SecurityMiddleware


def attach_log_handler(settings: Settings) -> None:
    path = (settings.data_dir / "logs" / "mygolfviz-api.log").resolve()
    for name in ("mygolfviz_api", "uvicorn"):
        logger = logging.getLogger(name)
        if any(
            isinstance(h, RotatingFileHandler) and h.baseFilename == str(path)
            for h in logger.handlers
        ):
            continue
        handler = RotatingFileHandler(
            path, maxBytes=1_000_000, backupCount=3, encoding="utf-8"
        )
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
        )
        logger.addHandler(handler)
        if logger.level == logging.NOTSET or logger.level > logging.INFO:
            logger.setLevel(logging.INFO)


def create_app(settings: Settings) -> FastAPI:
    for sub in ("originals", "backups", "logs"):
        (settings.data_dir / sub).mkdir(parents=True, exist_ok=True)
    attach_log_handler(settings)

    app = FastAPI(title="MyGolfViz API", docs_url=None, redoc_url=None)
    app.state.settings = settings
    app.state.schema_version = upgrade(settings)
    app.state.engine = make_engine(db_path(settings))

    app.add_middleware(
        SecurityMiddleware,
        token=settings.token,
        allowed_hosts=settings.resolved_allowed_hosts(),
    )

    @app.get("/api/v1/health")
    def health() -> dict:
        return {"status": "ok", "appVersion": __version__, "schemaVersion": app.state.schema_version}

    # TEMPORARY stub; Task 5 replaces it with the real sessions router.
    @app.get("/api/v1/sessions")
    def _sessions_stub() -> list:
        return []

    return app
