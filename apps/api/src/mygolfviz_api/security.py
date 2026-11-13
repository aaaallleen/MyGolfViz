from __future__ import annotations

import hmac
from http.cookies import SimpleCookie
from urllib.parse import parse_qs

from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp, Receive, Scope, Send

TOKEN_HEADER = "x-mygolfviz-token"
TOKEN_COOKIE = "mygolfviz_token"
OPEN_PATHS = frozenset({"/api/v1/health"})


def _same(a: str | None, b: str) -> bool:
    return a is not None and hmac.compare_digest(a.encode(), b.encode())


class SecurityMiddleware:
    """Host allow-list plus per-launch token. Never logs tokens or bodies."""

    def __init__(self, app: ASGIApp, token: str, allowed_hosts: tuple[str, ...]) -> None:
        self.app = app
        self.token = token
        self.allowed_hosts = frozenset(h.lower() for h in allowed_hosts)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "lifespan":
            await self.app(scope, receive, send)
            return
        if scope["type"] != "http":
            # No WebSocket (or other) endpoints exist; refuse rather than skip the checks.
            if scope["type"] == "websocket":
                await send({"type": "websocket.close", "code": 1008})
            return

        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope["headers"]}
        if headers.get("host", "").lower() not in self.allowed_hosts:
            await JSONResponse({"detail": "Wrong host"}, status_code=421)(scope, receive, send)
            return

        path = scope["path"]
        if path == "/" and scope["method"] == "GET":
            query = parse_qs(scope.get("query_string", b"").decode("latin-1"))
            if "token" in query:
                await self._exchange(query["token"][0], scope, receive, send)
                return

        if path.startswith("/api/v1/") and path not in OPEN_PATHS:
            cookie = SimpleCookie()
            try:
                cookie.load(headers.get("cookie", ""))
            except Exception:
                pass
            morsel = cookie.get(TOKEN_COOKIE)
            if not (
                _same(headers.get(TOKEN_HEADER), self.token)
                or _same(morsel.value if morsel else None, self.token)
            ):
                await JSONResponse({"detail": "Not authorised"}, status_code=401)(
                    scope, receive, send
                )
                return

        await self.app(scope, receive, send)

    async def _exchange(self, supplied: str, scope: Scope, receive: Receive, send: Send) -> None:
        if not _same(supplied, self.token):
            await JSONResponse({"detail": "Not authorised"}, status_code=401)(scope, receive, send)
            return
        response = Response(status_code=303, headers={"Location": "/"})
        response.set_cookie(
            TOKEN_COOKIE, self.token, httponly=True, samesite="strict", path="/"
        )
        await response(scope, receive, send)
