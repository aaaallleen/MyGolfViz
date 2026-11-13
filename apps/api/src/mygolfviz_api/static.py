from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response

NO_STORE = {"Cache-Control": "no-store"}

_PLACEHOLDER = (
    "<!doctype html><html><head><meta charset='utf-8'><title>MyGolfViz</title></head>"
    "<body><h1>MyGolfViz</h1><p>The frontend isn't built yet. "
    "Run <code>npm run build:local</code> and restart.</p></body></html>"
)


def install_static(app: FastAPI, static_dir: Path | None) -> None:
    """Serve the built frontend (SPA fallback). Must be registered after API routes."""
    root = static_dir.resolve() if static_dir is not None else None

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> Response:
        if path == "api" or path.startswith("api/"):
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        if root is None:
            return HTMLResponse(_PLACEHOLDER, headers=NO_STORE)
        if path:
            candidate = (root / path).resolve()
            if candidate.is_relative_to(root) and candidate.is_file():
                return FileResponse(candidate)
            if path.startswith("assets/"):
                return JSONResponse({"detail": "Not Found"}, status_code=404)
        index = root / "index.html"
        if not index.is_file():
            return HTMLResponse(_PLACEHOLDER, headers=NO_STORE)
        return FileResponse(index, headers=NO_STORE)
