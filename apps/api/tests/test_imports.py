from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from mygolfviz_api import models
from mygolfviz_api.app import create_app
from mygolfviz_api.db import session_scope
from mygolfviz_api.routers import imports as imports_router

FIX = Path(__file__).resolve().parents[3] / "fixtures" / "flightscope"
NAMES = [
    "FlightScope Golf Session Sept 19 2022",
    "FlightScope Golf Session Sept 19",
    "FlightScope Golf Session",
]
NEW_SESSION = {
    "newSession": {"name": "Range day", "date": "2022-09-19", "notes": "", "handedness": "right"}
}


def csv_bytes(name: str) -> bytes:
    return (FIX / f"{name}.csv").read_bytes()


def payload(name: str) -> dict:
    return json.loads((FIX / "payloads" / f"{name}.json").read_text())


def expected(name: str) -> dict:
    return json.loads((FIX / "expected" / f"{name}.expected.json").read_text())


def post_import(client, destination, entries, *, content: dict[str, bytes] | None = None):
    """entries: list of manifest file dicts (already carrying 'field')."""
    parts = []
    for e in entries:
        data = (content or {}).get(e["field"])
        if data is None:
            data = csv_bytes(e["name"].removesuffix(".csv"))
        parts.append((e["field"], (e["name"], data, "text/csv")))
    manifest = json.dumps({"destination": destination, "files": entries})
    return client.post("/api/v1/imports", data={"manifest": manifest}, files=parts)


def entry(name: str, field: str, accept: bool = False) -> dict:
    e = payload(name)
    e["field"] = field
    e["acceptCrossSessionDuplicate"] = accept
    return e


def originals(settings) -> list[str]:
    return sorted(p.name for p in (settings.data_dir / "originals").iterdir())


def import_all(client):
    entries = [entry(n, f"file{i}") for i, n in enumerate(NAMES)]
    return post_import(client, NEW_SESSION, entries)


def count(engine, model) -> int:
    with session_scope(engine) as db:
        return db.scalar(select(func.count()).select_from(model))


def test_import_three_into_new_session(client):
    r = import_all(client)
    assert r.status_code == 200, r.text
    body = r.json()
    assert [x["status"] for x in body["results"]] == ["imported"] * 3
    for res, name in zip(body["results"], NAMES):
        assert res["shotCount"] == expected(name)["shotCount"]
        assert res["importId"]
    s = body["session"]
    assert s["name"] == "Range day" and s["date"] == "2022-09-19"
    assert s["fileCount"] == 3
    assert s["shotCount"] == sum(expected(n)["shotCount"] for n in NAMES)
    assert s["createdAt"].endswith("Z")
    assert [c["club"] for c in s["clubs"]][:4] == ["Driver", "4 Hybrid", "7 Iron", "8 Iron"]


def test_roundtrip_matches_golden(client):
    body = import_all(client).json()
    engine = client.app.state.engine
    keys = None
    with session_scope(engine) as db:
        for res, name in zip(body["results"], NAMES):
            exp = expected(name)
            shots = db.scalars(
                select(models.Shot).where(models.Shot.import_id == res["importId"])
            ).all()
            assert len(shots) == exp["shotCount"]
            clubs: dict[str, int] = {}
            for s in shots:
                clubs[s.club] = clubs.get(s.club, 0) + 1
                assert len(s.measurements) == 27
                keys = keys or set(s.measurements)
                assert set(s.measurements) == keys
            assert clubs == exp["clubs"]
            for k, n in exp["nonNullCounts"].items():
                assert sum(1 for s in shots if s.measurements[k] is not None) == n, k


def test_hash_recomputed(client):
    e = entry(NAMES[0], "file0")
    e["sha256"] = "0" * 64
    data = csv_bytes(NAMES[0]) + b"\n# changed\n"
    r = post_import(client, NEW_SESSION, [e], content={"file0": data})
    assert r.json()["results"][0]["status"] == "imported"
    with session_scope(client.app.state.engine) as db:
        imp = db.scalars(select(models.Import)).one()
        assert imp.sha256 == hashlib.sha256(data).hexdigest()
        assert imp.byte_length == len(data)


def test_same_file_twice_in_one_request(client):
    entries = [entry(NAMES[0], "a"), entry(NAMES[0], "b")]
    r = post_import(client, NEW_SESSION, entries)
    assert [x["status"] for x in r.json()["results"]] == ["imported", "skipped_duplicate"]


def test_same_file_again_same_session_skipped(client, settings):
    first = import_all(client).json()
    sid = first["session"]["id"]
    engine = client.app.state.engine
    before = (count(engine, models.Import), count(engine, models.Shot))
    r = post_import(client, {"sessionId": sid}, [entry(NAMES[1], "f")])
    assert r.json()["results"][0]["status"] == "skipped_duplicate"
    assert (count(engine, models.Import), count(engine, models.Shot)) == before


def test_ordinal_is_max_plus_one(client):
    first = import_all(client).json()
    sid = first["session"]["id"]
    changed = csv_bytes(NAMES[0]) + b"\n"
    post_import(client, {"sessionId": sid}, [entry(NAMES[0], "f")], content={"f": changed})
    with session_scope(client.app.state.engine) as db:
        ords = sorted(db.scalars(select(models.Import.ordinal)).all())
    assert ords == [1, 2, 3, 4]


def test_cross_session_requires_accept(client, settings):
    first = import_all(client).json()
    assert first["session"]["id"]
    other = {"newSession": {"name": "Other", "date": "2022-10-01", "notes": "", "handedness": "left"}}
    r = post_import(client, other, [entry(NAMES[0], "f")])
    res = r.json()["results"][0]
    assert res["status"] == "invalid" and res["reason"] == "in_other_session"
    r = post_import(client, other, [entry(NAMES[0], "f", accept=True)])
    # the second request created yet another session; the first one stays empty of this file
    assert r.json()["results"][0]["status"] == "imported"
    assert len([n for n in originals(settings) if n.endswith(".csv")]) == 3
    assert not [n for n in originals(settings) if n.startswith(".tmp")]


def test_invalid_payloads(client):
    good = entry(NAMES[2], "good")
    sid = post_import(client, NEW_SESSION, [entry(NAMES[1], "seed")]).json()["session"]["id"]
    dest = {"sessionId": sid}

    def bad(mutate) -> dict:
        e = entry(NAMES[0], "bad")
        mutate(e)
        return e

    def del_key(e):
        del e["shots"][0]["m"]["carry"]

    def extra_key(e):
        e["shots"][0]["m"]["bogus"] = 1

    def dup_row(e):
        e["shots"][1]["sourceRow"] = e["shots"][0]["sourceRow"]

    cases = {
        "version": lambda e: e.update(parserVersion="9.9.9"),
        "missing": del_key,
        "extra": extra_key,
        "dup": dup_row,
        "zero": lambda e: e.update(shots=[]),
    }
    for label, mutate in cases.items():
        r = post_import(client, dest, [bad(mutate), good])
        results = r.json()["results"]
        assert results[0]["status"] == "invalid", label
        assert results[0]["reason"], label
        assert results[1]["status"] in ("imported", "skipped_duplicate"), label

    # NaN is not valid JSON, but Python's parser accepts it; it must still be rejected.
    e = entry(NAMES[0], "nan")
    manifest = json.dumps({"destination": NEW_SESSION, "files": [e]}).replace(
        '"ballSpeed": 142.5', '"ballSpeed": NaN', 1
    )
    assert "NaN" in manifest
    r = client.post(
        "/api/v1/imports",
        data={"manifest": manifest},
        files=[("nan", (e["name"], csv_bytes(NAMES[0]), "text/csv"))],
    )
    assert r.json()["results"][0]["status"] == "invalid"


def test_missing_file_part_is_invalid(client):
    e = entry(NAMES[0], "file0")
    manifest = json.dumps({"destination": NEW_SESSION, "files": [e]})
    r = client.post("/api/v1/imports", data={"manifest": manifest})
    assert r.json()["results"][0]["status"] == "invalid"


def test_bad_destination(client):
    r = post_import(client, {"sessionId": "nope"}, [entry(NAMES[0], "f")])
    assert r.status_code == 404
    bad = {"newSession": {"name": "  ", "date": "2022-09-19"}}
    assert post_import(client, bad, [entry(NAMES[0], "f")]).status_code == 422
    bad = {"newSession": {"name": "x", "date": "2022-02-30"}}
    assert post_import(client, bad, [entry(NAMES[0], "f")]).status_code == 422
    bad = {"newSession": {"name": "x", "date": "2022-02-03", "handedness": "both"}}
    assert post_import(client, bad, [entry(NAMES[0], "f")]).status_code == 422


def test_db_failure_leaves_nothing(client, settings, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("disk on fire")

    monkeypatch.setattr(imports_router, "insert_shots", boom)
    r = post_import(client, NEW_SESSION, [entry(NAMES[0], "f")])
    res = r.json()["results"][0]
    assert res["status"] == "invalid" and res["reason"] == "storage_error"
    engine = client.app.state.engine
    assert count(engine, models.Import) == 0 and count(engine, models.Shot) == 0
    assert originals(settings) == []


def test_db_failure_keeps_preexisting_original(client, settings, monkeypatch):
    import_all(client)
    other = {"newSession": {"name": "Other", "date": "2022-10-01"}}

    def boom(*a, **k):
        raise RuntimeError("x")

    monkeypatch.setattr(imports_router, "insert_shots", boom)
    r = post_import(client, other, [entry(NAMES[0], "f", accept=True)])
    assert r.json()["results"][0]["reason"] == "storage_error"
    assert len(originals(settings)) == 3


def test_sweep_removes_temp_and_orphans(client, settings):
    import_all(client)
    od = settings.data_dir / "originals"
    (od / ".tmp-x").write_bytes(b"x")
    (od / ("f" * 64 + ".csv")).write_bytes(b"orphan")
    with TestClient(create_app(settings)):
        pass
    left = originals(settings)
    assert len(left) == 3 and all(not n.startswith(".tmp") and n != "f" * 64 + ".csv" for n in left)


def test_check_endpoint(client):
    first = import_all(client).json()
    sid = first["session"]["id"]
    other = post_import(
        client,
        {"newSession": {"name": "Other", "date": "2022-10-01"}},
        [entry(NAMES[0], "f", accept=True)],
    ).json()["session"]["id"]
    sha0 = expected(NAMES[0])["sha256"]
    unknown = "a" * 64
    r = client.post("/api/v1/imports/check", json={"sha256s": [sha0, unknown], "sessionId": other})
    res = {x["sha256"]: x for x in r.json()["results"]}
    assert res[sha0]["inDestination"] is True
    assert res[sha0]["otherSessions"] == [{"id": sid, "name": "Range day"}]
    assert res[unknown] == {"sha256": unknown, "inDestination": False, "otherSessions": []}
    r = client.post("/api/v1/imports/check", json={"sha256s": [expected(NAMES[1])["sha256"]], "sessionId": other})
    x = r.json()["results"][0]
    assert x["inDestination"] is False and [s["id"] for s in x["otherSessions"]] == [sid]
    r = client.post("/api/v1/imports/check", json={"sha256s": [sha0]})
    assert len(r.json()["results"][0]["otherSessions"]) == 2


def test_requires_token(anon):
    assert anon.post("/api/v1/imports/check", json={"sha256s": []}).status_code in (401, 403)


def test_manifest_larger_than_1mb(client):
    e = entry(NAMES[0], "big")
    e["shots"][0]["raw"]["pad"] = "x" * 1_500_000
    r = post_import(client, NEW_SESSION, [e], content={"big": csv_bytes(NAMES[0])})
    assert r.status_code == 200, r.text[:200]
    assert r.json()["results"][0]["status"] == "imported"


def _parallel(fns):
    from concurrent.futures import ThreadPoolExecutor

    with ThreadPoolExecutor(len(fns)) as ex:
        return [f.result() for f in [ex.submit(fn) for fn in fns]]


def test_concurrent_same_file_same_session(client):
    sid = post_import(client, NEW_SESSION, [entry(NAMES[0], "seed")]).json()["session"]["id"]
    sid2 = post_import(
        client, {"newSession": {"name": "B", "date": "2022-10-01"}}, [entry(NAMES[1], "s")]
    ).json()["session"]["id"]
    dest = {"sessionId": sid2}
    rs = _parallel([lambda: post_import(client, dest, [entry(NAMES[2], "f")]) for _ in range(4)])
    statuses = sorted(r.json()["results"][0]["status"] for r in rs)
    assert statuses == ["imported", "skipped_duplicate", "skipped_duplicate", "skipped_duplicate"]
    assert sid


def test_concurrent_distinct_ordinals(client):
    sid = post_import(client, NEW_SESSION, [entry(NAMES[0], "seed")]).json()["session"]["id"]
    dest = {"sessionId": sid}
    variants = [csv_bytes(NAMES[1]) + b"\n" * i for i in range(1, 6)]
    rs = _parallel(
        [lambda v=v: post_import(client, dest, [entry(NAMES[1], "f")], content={"f": v}) for v in variants]
    )
    assert all(r.json()["results"][0]["status"] == "imported" for r in rs)
    with session_scope(client.app.state.engine) as db:
        ords = sorted(
            db.scalars(select(models.Import.ordinal).where(models.Import.session_id == sid)).all()
        )
    assert ords == [1, 2, 3, 4, 5, 6]


def test_concurrent_failure_keeps_shared_original(client, settings, monkeypatch):
    s1 = post_import(client, NEW_SESSION, [entry(NAMES[1], "seed")]).json()["session"]["id"]
    s2 = post_import(
        client, {"newSession": {"name": "B", "date": "2022-10-01"}}, [entry(NAMES[2], "seed")]
    ).json()["session"]["id"]
    real = imports_router.insert_shots

    def flaky(db, import_id, shots):
        if db.get(models.Import, import_id).session_id == s1:
            raise RuntimeError("fail for s1")
        real(db, import_id, shots)

    monkeypatch.setattr(imports_router, "insert_shots", flaky)
    rs = _parallel(
        [
            lambda: post_import(client, {"sessionId": s1}, [entry(NAMES[0], "f", True)]),
            lambda: post_import(client, {"sessionId": s2}, [entry(NAMES[0], "f", True)]),
        ]
    )
    assert rs[0].json()["results"][0]["reason"] == "storage_error"
    assert rs[1].json()["results"][0]["status"] == "imported"
    assert (settings.data_dir / "originals" / f"{expected(NAMES[0])['sha256']}.csv").exists()


def test_put_fsyncs_directory(tmp_path, monkeypatch):
    import os
    import stat

    from mygolfviz_api.storage import OriginalStore

    store = OriginalStore(tmp_path)
    events: list[str] = []
    real_fsync = os.fsync
    real_replace = os.replace

    def fsync(fd):
        events.append("fsync-dir" if stat.S_ISDIR(os.fstat(fd).st_mode) else "fsync-file")
        real_fsync(fd)

    def replace(a, b):
        events.append("replace")
        real_replace(a, b)

    monkeypatch.setattr(os, "fsync", fsync)
    monkeypatch.setattr(os, "replace", replace)
    store.put(b"hello")
    assert events == ["fsync-file", "replace", "fsync-dir"]
