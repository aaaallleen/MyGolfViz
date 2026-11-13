from __future__ import annotations

from urllib.parse import unquote

from test_imports import NAMES, NEW_SESSION, csv_bytes, entry, expected, import_all, originals, post_import


def mk(client, **kw):
    body = {"name": "Range", "date": "2022-09-19", **kw}
    return client.post("/api/v1/sessions", json=body)


def test_create_requires_name_and_date(client):
    assert client.post("/api/v1/sessions", json={"name": "x"}).status_code == 422
    assert mk(client, name="   ").status_code == 422
    r = mk(client, name="  Range  ")
    assert r.status_code == 201
    assert r.json()["name"] == "Range"
    assert r.json()["handedness"] == "right" and r.json()["notes"] == ""


def test_patch_cannot_clear_date(client):
    sid = mk(client).json()["id"]
    assert client.patch(f"/api/v1/sessions/{sid}", json={"date": None}).status_code == 422
    r = client.patch(f"/api/v1/sessions/{sid}", json={"notes": "hi", "handedness": "left"})
    assert r.status_code == 200 and r.json()["notes"] == "hi" and r.json()["handedness"] == "left"
    assert r.json()["updatedAt"] >= r.json()["createdAt"]


def test_unknown_ids_404(client):
    for method, url in [
        ("get", "/api/v1/sessions/nope"),
        ("patch", "/api/v1/sessions/nope"),
        ("delete", "/api/v1/sessions/nope"),
        ("get", "/api/v1/sessions/nope/shots"),
        ("get", "/api/v1/sessions/nope/imports"),
        ("delete", "/api/v1/imports/nope"),
        ("get", "/api/v1/imports/nope/original"),
    ]:
        r = getattr(client, method)(url, **({"json": {}} if method == "patch" else {}))
        assert r.status_code == 404 and r.json() == {"detail": "Not found"}, url


def test_library_row_counts(client):
    body = import_all(client).json()
    sid = body["session"]["id"]
    rows = client.get("/api/v1/sessions").json()
    assert len(rows) == 1
    s = rows[0]
    total = sum(expected(n)["shotCount"] for n in NAMES)
    assert s["shotCount"] == total and s["fileCount"] == 3
    assert sum(c["count"] for c in s["clubs"]) == total
    detail = client.get(f"/api/v1/sessions/{sid}").json()
    assert [i["ordinal"] for i in detail["imports"]] == [1, 2, 3]
    assert detail["imports"][0]["originalFilename"].removesuffix(".csv") == NAMES[0]
    shots = client.get(f"/api/v1/sessions/{sid}/shots").json()
    assert len(shots) == total and not any(x["excluded"] for x in shots)
    assert set(shots[0]) >= {"id", "importId", "sourceRow", "shotLabel", "club", "m", "raw", "flags"}


def _ids(client, sid):
    return [i["id"] for i in client.get(f"/api/v1/sessions/{sid}/imports").json()]


def test_reorder_and_renumber(client):
    sid = import_all(client).json()["session"]["id"]
    a, b, c = _ids(client, sid)
    assert client.patch(f"/api/v1/sessions/{sid}/imports/order", json={"importIds": [a]}).status_code == 422
    assert client.patch(f"/api/v1/sessions/{sid}/imports/order", json={"importIds": [a, a, b]}).status_code == 422
    r = client.patch(f"/api/v1/sessions/{sid}/imports/order", json={"importIds": [c, b, a]})
    assert r.status_code == 200
    assert [(i["id"], i["ordinal"]) for i in r.json()] == [(c, 1), (b, 2), (a, 3)]
    assert client.delete(f"/api/v1/imports/{b}").status_code == 204
    imps = client.get(f"/api/v1/sessions/{sid}/imports").json()
    assert [(i["id"], i["ordinal"]) for i in imps] == [(c, 1), (a, 2)]
    assert client.get(f"/api/v1/sessions/{sid}").json()["session"]["fileCount"] == 2


def test_rename_import(client):
    sid = import_all(client).json()["session"]["id"]
    a = _ids(client, sid)[0]
    r = client.patch(f"/api/v1/imports/{a}", json={"displayName": " Nice "})
    assert r.json()["displayName"] == "Nice"
    assert client.patch(f"/api/v1/imports/{a}", json={"displayName": None}).json()["displayName"] is None


def test_remove_import_keeps_exclusions(client):
    sid = import_all(client).json()["session"]["id"]
    a, b, c = _ids(client, sid)
    shots = client.get(f"/api/v1/sessions/{sid}/shots").json()
    target = next(s for s in shots if s["importId"] == b)
    r = client.patch(f"/api/v1/sessions/{sid}/exclusions", json={"exclude": [target["id"]], "include": []})
    assert r.json() == {"excludedShotIds": [target["id"]]}
    assert client.delete(f"/api/v1/imports/{b}").status_code == 204
    assert client.get(f"/api/v1/sessions/{sid}/shots").json()
    # exclusion row is kept but ignored
    assert client.patch(f"/api/v1/sessions/{sid}/exclusions", json={}).json() == {"excludedShotIds": []}
    r = post_import(client, {"sessionId": sid}, [entry(NAMES[1], "f")])
    assert r.json()["results"][0]["status"] == "imported"
    new = client.get(f"/api/v1/sessions/{sid}/shots").json()
    again = [s for s in new if s["sourceRow"] == target["sourceRow"] and s["importId"] != target["importId"]
             and s["importId"] not in (a, c)]
    assert len(again) == 1 and again[0]["excluded"] is True
    assert sum(s["excluded"] for s in new) == 1


def test_same_file_two_sessions_independent_exclusions(client):
    e = lambda f: entry(NAMES[2], f)  # noqa: E731
    s1 = post_import(client, NEW_SESSION, [e("a")]).json()["session"]["id"]
    s2 = post_import(
        client, NEW_SESSION, [entry(NAMES[2], "a", accept=True)]
    ).json()["session"]["id"]
    sh1 = client.get(f"/api/v1/sessions/{s1}/shots").json()
    r = client.patch(f"/api/v1/sessions/{s1}/exclusions", json={"exclude": [sh1[0]["id"]]})
    assert r.json()["excludedShotIds"] == [sh1[0]["id"]]
    assert not any(s["excluded"] for s in client.get(f"/api/v1/sessions/{s2}/shots").json())
    assert sum(s["excluded"] for s in client.get(f"/api/v1/sessions/{s1}/shots").json()) == 1
    r = client.patch(f"/api/v1/sessions/{s1}/exclusions", json={"include": [sh1[0]["id"]]})
    assert r.json() == {"excludedShotIds": []}


def test_exclusions_reject_foreign_shot(client):
    s1 = post_import(client, NEW_SESSION, [entry(NAMES[2], "a")]).json()["session"]["id"]
    s2 = post_import(client, NEW_SESSION, [entry(NAMES[1], "a")]).json()["session"]["id"]
    mine = client.get(f"/api/v1/sessions/{s1}/shots").json()[0]["id"]
    foreign = client.get(f"/api/v1/sessions/{s2}/shots").json()[0]["id"]
    r = client.patch(f"/api/v1/sessions/{s1}/exclusions", json={"exclude": [mine, foreign]})
    assert r.status_code == 422
    assert client.patch(f"/api/v1/sessions/{s1}/exclusions", json={}).json() == {"excludedShotIds": []}


def test_original_download_exact_bytes_and_unicode_name(client):
    name = "Range é, 3.csv"
    e = entry(NAMES[2], "f")
    e["name"] = name
    sid = post_import(client, NEW_SESSION, [e], content={"f": csv_bytes(NAMES[2])}).json()["session"]["id"]
    imp = client.get(f"/api/v1/sessions/{sid}/imports").json()[0]
    r = client.get(f"/api/v1/imports/{imp['id']}/original")
    assert r.status_code == 200 and r.content == csv_bytes(NAMES[2])
    assert r.headers["content-type"].startswith("text/csv")
    cd = r.headers["content-disposition"]
    assert cd.startswith('attachment; filename="Range _, 3.csv"')
    assert unquote(cd.split("filename*=UTF-8''")[1]) == name


def test_remove_last_import_keeps_session(client):
    sid = post_import(client, NEW_SESSION, [entry(NAMES[2], "a")]).json()["session"]["id"]
    imp = _ids(client, sid)[0]
    assert client.delete(f"/api/v1/imports/{imp}").status_code == 204
    s = client.get(f"/api/v1/sessions/{sid}").json()["session"]
    assert s["shotCount"] == 0 and s["fileCount"] == 0 and s["clubs"] == []
    assert client.get(f"/api/v1/sessions/{sid}/shots").json() == []


def test_delete_session_gcs_originals(client, settings):
    shared = post_import(client, NEW_SESSION, [entry(NAMES[2], "a")]).json()["session"]["id"]
    other = post_import(
        client, NEW_SESSION, [entry(NAMES[2], "a", accept=True), entry(NAMES[1], "b")]
    ).json()["session"]["id"]
    assert len(originals(settings)) == 2
    assert client.delete(f"/api/v1/sessions/{other}").status_code == 204
    assert len(originals(settings)) == 1  # shared one survives, unshared removed
    assert client.get(f"/api/v1/sessions/{other}").status_code == 404
    assert client.get(f"/api/v1/sessions/{shared}").json()["session"]["fileCount"] == 1
    assert client.delete(f"/api/v1/sessions/{shared}").status_code == 204
    assert originals(settings) == []
