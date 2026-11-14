from __future__ import annotations

from test_imports import entry, post_import

LATER_FILE = "FlightScope Golf Session Sept 19 2022"
EARLIER_FILE = "FlightScope Golf Session"


def _session(client, name, date):
    r = client.post("/api/v1/sessions", json={"name": name, "date": date, "notes": "", "handedness": "right"})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _seed(client):
    later = _session(client, "Later", "2026-11-07")
    earlier = _session(client, "Earlier", "2026-10-01")
    r = post_import(client, {"sessionId": later}, [entry(LATER_FILE, "f0")])
    assert r.status_code == 200, r.text
    r = post_import(client, {"sessionId": earlier}, [entry(EARLIER_FILE, "f0")])
    assert r.status_code == 200, r.text
    return later, earlier


def test_shots_across_sessions_in_session_order(client):
    later, earlier = _seed(client)
    r = client.get("/api/v1/shots", params={"club": "Driver"})
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 34
    assert [x["sessionId"] for x in rows[:18]] == [earlier] * 18
    assert [x["sessionId"] for x in rows[18:]] == [later] * 16
    for x in rows:
        assert x["importId"]
        assert len(x["m"]) == 27
        assert "raw" not in x
        assert x["excluded"] is False


def test_shots_filter_by_sessions_and_unknown_ids_ignored(client):
    later, _ = _seed(client)
    r = client.get("/api/v1/shots", params={"club": "Driver", "session_ids": [later, "nope"]})
    assert len(r.json()) == 16


def test_shots_report_exclusions(client):
    later, _ = _seed(client)
    rows = client.get("/api/v1/shots", params={"club": "Driver", "session_ids": [later]}).json()
    ids = [rows[0]["id"], rows[1]["id"]]
    assert client.patch(f"/api/v1/sessions/{later}/exclusions", json={"exclude": ids}).status_code == 200
    rows = client.get("/api/v1/shots", params={"club": "Driver"}).json()
    assert {x["id"] for x in rows if x["excluded"]} == set(ids)


def test_shots_filtered_by_sessions_still_report_exclusions(client):
    later, earlier = _seed(client)
    later_ids = [x["id"] for x in client.get("/api/v1/shots", params={"session_ids": [later]}).json()[:2]]
    earlier_ids = [x["id"] for x in client.get("/api/v1/shots", params={"session_ids": [earlier]}).json()[:3]]
    for sid, ids in ((later, later_ids), (earlier, earlier_ids)):
        assert client.patch(f"/api/v1/sessions/{sid}/exclusions", json={"exclude": ids}).status_code == 200
    rows = client.get("/api/v1/shots", params={"session_ids": [later]}).json()
    assert {x["id"] for x in rows if x["excluded"]} == set(later_ids)
    rows = client.get("/api/v1/shots", params={"session_ids": [earlier, later]}).json()
    assert {x["id"] for x in rows if x["excluded"]} == set(later_ids) | set(earlier_ids)


def test_shots_without_club_param_returns_all_clubs(client):
    _, earlier = _seed(client)
    r = client.get("/api/v1/shots", params={"session_ids": [earlier]})
    assert len(r.json()) == 91


def test_settings_roundtrip_and_404(client):
    assert client.get("/api/v1/settings/progression.layout").status_code == 404
    r = client.put("/api/v1/settings/progression.layout", json={"value": {"tiles": ["carry"]}})
    assert r.status_code == 200
    got = client.get("/api/v1/settings/progression.layout").json()
    assert got["value"] == {"tiles": ["carry"]}
    assert got["key"] == "progression.layout"
    assert got["updatedAt"]
    client.put("/api/v1/settings/progression.layout", json={"value": [1]})
    assert client.get("/api/v1/settings/progression.layout").json()["value"] == [1]


def test_settings_rejects_bad_key_and_large_value(client):
    assert client.put("/api/v1/settings/Bad Key", json={"value": 1}).status_code == 422
    assert client.put("/api/v1/settings/ok", json={"value": "x" * 70000}).status_code == 422


def _tr(client, **kw):
    body = {"club": "Driver", "metric": "carry", "low": 230, "high": 250} | kw
    return client.put("/api/v1/target-ranges", json=body)


def test_target_ranges_upsert_list_delete(client):
    assert _tr(client).status_code == 200
    r = _tr(client, low=235)
    assert r.status_code == 200
    rows = client.get("/api/v1/target-ranges", params={"club": "Driver"}).json()
    assert len(rows) == 1 and rows[0]["low"] == 235
    _tr(client, club="7 Iron")
    assert len(client.get("/api/v1/target-ranges").json()) == 2
    tid = rows[0]["id"]
    assert client.delete(f"/api/v1/target-ranges/{tid}").status_code == 204
    assert client.delete(f"/api/v1/target-ranges/{tid}").status_code == 404


def test_target_range_validation(client):
    assert _tr(client, metric="banana").status_code == 422
    assert _tr(client, low=None, high=None).status_code == 422
    assert _tr(client, low=5, high=1).status_code == 422
    assert _tr(client, club="  ").status_code == 422
    assert _tr(client, club="x" * 101).status_code == 422
    assert _tr(client, low=230, high=None).status_code == 200


def test_target_range_club_with_slash(client):
    assert _tr(client, club="50/08 Wedge").status_code == 200
    rows = client.get("/api/v1/target-ranges", params={"club": "50/08 Wedge"}).json()
    assert [x["club"] for x in rows] == ["50/08 Wedge"]


def test_library_routes_need_token(anon):
    for p in ("/api/v1/shots", "/api/v1/settings/x", "/api/v1/target-ranges"):
        assert anon.get(p).status_code == 401
