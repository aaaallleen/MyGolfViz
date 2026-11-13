from fastapi.testclient import TestClient

from mygolfviz_api.app import create_app
from mygolfviz_api.config import Settings


def _static_client(tmp_path):
    static = tmp_path / "static"
    (static / "assets").mkdir(parents=True)
    (static / "index.html").write_text("<html>INDEX</html>")
    (static / "assets" / "a.js").write_text("console.log(1)")
    settings = Settings(
        data_dir=tmp_path / "data", token="t", allowed_hosts=("testserver",), static_dir=static
    )
    return TestClient(create_app(settings))


def test_index_served_with_static_dir(tmp_path):
    with _static_client(tmp_path) as c:
        r = c.get("/")
        assert r.status_code == 200
        assert "INDEX" in r.text
        assert r.headers["cache-control"] == "no-store"
        a = c.get("/assets/a.js")
        assert a.status_code == 200
        assert a.text == "console.log(1)"
        deep = c.get("/some/client/route")
        assert "INDEX" in deep.text
        assert deep.headers["cache-control"] == "no-store"
        assert c.get("/assets/missing.js").status_code == 404


def test_api_404_not_swallowed_by_spa(tmp_path):
    with _static_client(tmp_path) as c:
        r = c.get("/api/v1/nope", headers={"X-MyGolfViz-Token": "t"})
        assert r.status_code == 404
        assert r.headers["content-type"].startswith("application/json")
        r2 = c.get("/api/other")
        assert r2.status_code == 404
        assert "INDEX" not in r2.text


def test_token_exchange_still_works_with_static(tmp_path):
    with _static_client(tmp_path) as c:
        r = c.get("/?token=t", follow_redirects=False)
        assert r.status_code == 303
        assert "mygolfviz_token" in r.headers["set-cookie"]


def test_traversal_does_not_escape(tmp_path):
    (tmp_path / "secret.txt").write_text("SECRET")
    with _static_client(tmp_path) as c:
        r = c.get("/..%2fsecret.txt")
        assert "SECRET" not in r.text


def test_placeholder_without_static_dir(anon):
    r = anon.get("/")
    assert r.status_code == 200
    assert "npm run build:local" in r.text
