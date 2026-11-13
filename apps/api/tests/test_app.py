import json
import os
import subprocess
import sys
import time
import urllib.request

import pytest

from mygolfviz_api.app import create_app
from mygolfviz_api.config import AlreadyRunning, DataLock


def test_health_ok(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_creates_data_folders(settings, tmp_path, client):
    for sub in ("originals", "backups", "logs"):
        assert (tmp_path / sub).is_dir()
    client.get("/api/v1/health")
    assert (tmp_path / "logs" / "mygolfviz-api.log").exists()


def test_second_lock_refused(tmp_path):
    with DataLock(tmp_path):
        with pytest.raises(AlreadyRunning):
            DataLock(tmp_path).__enter__()


def test_cli_prints_port_line(tmp_path):
    env = {**os.environ, "MYGOLFVIZ_TOKEN": "tok123"}
    p = subprocess.Popen(
        [sys.executable, "-m", "mygolfviz_api", "--data-dir", str(tmp_path), "--port", "0"],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        env=env,
    )
    try:
        info = json.loads(p.stdout.readline())
        assert info["port"] > 0
        assert info["url"].endswith("?token=tok123")
        with urllib.request.urlopen(
            f"http://127.0.0.1:{info['port']}/api/v1/health", timeout=10
        ) as r:
            assert r.status == 200
        log = tmp_path / "logs" / "mygolfviz-api.log"
        deadline = time.time() + 5
        while time.time() < deadline and "uvicorn" not in (
            log.read_text() if log.exists() else ""
        ):
            time.sleep(0.1)
        assert " uvicorn" in log.read_text()
    finally:
        p.terminate()
        p.wait(timeout=10)
