def test_api_needs_token(anon):
    assert anon.get("/api/v1/sessions").status_code == 401
    assert anon.get("/api/v1/sessions").json() == {"detail": "Not authorised"}


def test_wrong_token_rejected(anon):
    r = anon.get("/api/v1/sessions", headers={"X-MyGolfViz-Token": "nope"})
    assert r.status_code == 401


def test_header_token_ok(client):
    assert client.get("/api/v1/sessions").status_code != 401


def test_token_exchange_sets_cookie(anon):
    r = anon.get("/?token=t", follow_redirects=False)
    assert r.status_code == 303
    assert r.headers["location"] == "/"
    cookie = r.headers["set-cookie"].lower()
    assert "mygolfviz_token=t" in cookie
    assert "httponly" in cookie
    assert "samesite=strict" in cookie
    assert "path=/" in cookie
    assert anon.get("/api/v1/sessions").status_code == 200


def test_token_exchange_wrong_token(anon):
    assert anon.get("/?token=bad", follow_redirects=False).status_code == 401


def test_wrong_host(anon):
    r = anon.get("/api/v1/health", headers={"Host": "evil.example:8765"})
    assert r.status_code == 421
    assert r.json() == {"detail": "Wrong host"}


def test_health_open(anon):
    assert anon.get("/api/v1/health").status_code == 200


def _asgi_scope(kind: str) -> dict:
    return {"type": kind, "path": "/api/v1/sessions", "headers": [(b"host", b"testserver")]}


def test_websocket_scope_rejected():
    import asyncio

    from mygolfviz_api.security import SecurityMiddleware

    async def inner(scope, receive, send):
        raise AssertionError("inner app must not be reached")

    sent: list[dict] = []

    async def receive():
        return {"type": "websocket.connect"}

    async def send(message):
        sent.append(message)

    mw = SecurityMiddleware(inner, "t", ("testserver",))
    asyncio.run(mw(_asgi_scope("websocket"), receive, send))
    assert sent == [{"type": "websocket.close", "code": 1008}]


def test_lifespan_scope_passes_through():
    import asyncio

    from mygolfviz_api.security import SecurityMiddleware

    seen: list[str] = []

    async def inner(scope, receive, send):
        seen.append(scope["type"])

    mw = SecurityMiddleware(inner, "t", ("testserver",))
    asyncio.run(mw({"type": "lifespan"}, None, None))
    assert seen == ["lifespan"]
