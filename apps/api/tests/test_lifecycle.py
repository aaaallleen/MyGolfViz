from __future__ import annotations

import json
import logging
import os
import signal
import sqlite3
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from alembic import command
from fastapi.testclient import TestClient

from mygolfviz_api import migrate
from mygolfviz_api.app import create_app
from mygolfviz_api.config import DataLock, Settings

FIX = Path(__file__).resolve().parents[3] / "fixtures" / "flightscope"
TOKEN = "lifecycle-token"


def spawn(tmp_path, *extra, stdin=None):
    return subprocess.Popen(
        [sys.executable, "-m", "mygolfviz_api", "--data-dir", str(tmp_path), "--port", "0", *extra],
        stdin=stdin,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env={**os.environ, "MYGOLFVIZ_TOKEN": TOKEN},
    )


def stop(p):
    if p.poll() is None:
        p.kill()
    p.wait(timeout=10)
    for stream in (p.stdin, p.stdout, p.stderr):
        if stream is not None:
            stream.close()


def assert_lock_free(tmp_path):
    with DataLock(tmp_path):
        pass


def import_one(port):
    name = "FlightScope Golf Session Sept 19 2022"
    entry = json.loads((FIX / "payloads" / f"{name}.json").read_text())
    entry["field"] = "file0"
    entry["acceptCrossSessionDuplicate"] = False
    manifest = {
        "destination": {
            "newSession": {"name": "Range day", "date": "2022-09-19", "notes": "", "handedness": "right"}
        },
        "files": [entry],
    }
    # Build the multipart body by hand to avoid a third-party HTTP client in the subprocess test.
    boundary = "xBOUNDARYx"
    csv = (FIX / f"{name}.csv").read_bytes()
    body = (
        f'--{boundary}\r\nContent-Disposition: form-data; name="manifest"\r\n\r\n{json.dumps(manifest)}\r\n'
        f'--{boundary}\r\nContent-Disposition: form-data; name="file0"; filename="{name}.csv"\r\n'
        "Content-Type: text/csv\r\n\r\n"
    ).encode() + csv + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}/api/v1/imports",
        data=body,
        headers={
            "X-MyGolfViz-Token": TOKEN,
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        assert r.status == 200


def test_sigterm_exits_cleanly_and_checkpoints(tmp_path):
    p = spawn(tmp_path)
    try:
        port = json.loads(p.stdout.readline())["port"]
        import_one(port)
        p.send_signal(signal.SIGTERM)
        assert p.wait(timeout=5) == 0
        wal = tmp_path / "mygolfviz.sqlite3-wal"
        assert not wal.exists() or wal.stat().st_size == 0
        assert_lock_free(tmp_path)
    finally:
        stop(p)


def test_exits_when_stdin_closes(tmp_path):
    p = spawn(tmp_path, "--exit-with-stdin", stdin=subprocess.PIPE)
    try:
        json.loads(p.stdout.readline())
        p.stdin.close()
        assert p.wait(timeout=5) == 0
        assert_lock_free(tmp_path)
    finally:
        stop(p)


def test_stdin_flag_absent_keeps_running(tmp_path):
    p = spawn(tmp_path, stdin=subprocess.PIPE)
    try:
        json.loads(p.stdout.readline())
        p.stdin.close()
        time.sleep(1)
        assert p.poll() is None
        p.terminate()
        assert p.wait(timeout=5) == 0
    finally:
        stop(p)


def test_lock_held_exits_3(tmp_path):
    with DataLock(tmp_path):
        p = spawn(tmp_path)
        try:
            out, err = p.communicate(timeout=10)
        finally:
            stop(p)
    assert p.returncode == 3
    assert "MyGolfViz is already running with this data folder" in err
    assert out == ""


def test_startup_failure_exits_4_and_logs(tmp_path):
    (tmp_path / "mygolfviz.sqlite3").write_text("not a database")
    p = spawn(tmp_path)
    try:
        out, err = p.communicate(timeout=20)
    finally:
        stop(p)
    assert p.returncode == 4
    assert out == ""
    assert "MyGolfViz couldn't start" in err
    log = (tmp_path / "logs" / "mygolfviz-api.log").read_text()
    assert "migration failed" in log
    assert "Traceback (most recent call last)" in log
    assert_lock_free(tmp_path)


def test_migration_backup_path_logged(tmp_path):
    settings = Settings(data_dir=tmp_path, token="t", allowed_hosts=("testserver",))
    command.stamp(migrate.make_config(settings), "base")
    con = sqlite3.connect(tmp_path / "mygolfviz.sqlite3")
    con.execute("create table legacy (x integer)")
    con.commit()
    con.close()
    (tmp_path / "logs").mkdir(exist_ok=True)
    logging.getLogger("mygolfviz_api").setLevel(logging.INFO)
    with TestClient(create_app(settings)):
        pass
    log = (tmp_path / "logs" / "mygolfviz-api.log").read_text()
    marker = "migration backup written to "
    assert marker in log
    path = Path(log.split(marker, 1)[1].splitlines()[0].strip())
    assert path.exists()
