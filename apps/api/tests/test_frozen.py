"""Checks the PyInstaller build of the backend (`npm run api:bin`).

Skipped unless MYGOLFVIZ_API_BIN names the built executable (relative paths resolve against the repo root).
"""

from __future__ import annotations

import json
import os
import queue
import subprocess
import threading
import urllib.request
from pathlib import Path

import pytest
from alembic.script import ScriptDirectory

from mygolfviz_api import migrate
from mygolfviz_api.static import CSP

REPO = Path(__file__).resolve().parents[3]
BIN = os.environ.get("MYGOLFVIZ_API_BIN")

pytestmark = pytest.mark.skipif(not BIN, reason="set MYGOLFVIZ_API_BIN to the frozen backend to run")

INDEX = "<!doctype html><title>frozen</title><p>frozen-index-marker</p>"


def read_line(stream, timeout: float) -> str:
    """The next line of `stream`, or "" if none arrives within `timeout` seconds."""
    lines: queue.Queue[str] = queue.Queue()
    threading.Thread(target=lambda: lines.put(stream.readline()), daemon=True).start()
    try:
        return lines.get(timeout=timeout)
    except queue.Empty:
        return ""


@pytest.fixture
def frozen(tmp_path):
    web = tmp_path / "web"
    web.mkdir()
    (web / "index.html").write_text(INDEX)
    env = {k: v for k, v in os.environ.items() if k not in ("MYGOLFVIZ_TOKEN", "MYGOLFVIZ_DATA_DIR")}
    p = subprocess.Popen(
        [
            str(REPO / BIN),
            "--data-dir", str(tmp_path / "data"),
            "--port", "0",
            "--static-dir", str(web),
            "--exit-with-stdin",
        ],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=env,
    )
    try:
        yield p
    finally:
        if p.poll() is None:
            p.kill()
        p.wait(timeout=10)
        for stream in (p.stdin, p.stdout, p.stderr):
            if not stream.closed:
                stream.close()


def test_frozen_backend_serves_and_exits_with_stdin(frozen):
    # A cold start of a one-folder PyInstaller build can take a few seconds.
    line = read_line(frozen.stdout, timeout=30)
    assert line, f"no port line; stderr:\n{frozen.stderr.read() if frozen.poll() is not None else ''}"
    info = json.loads(line)
    port = info["port"]
    assert port > 0
    assert info["url"].startswith(f"http://127.0.0.1:{port}/?token=")

    head = ScriptDirectory(str(Path(migrate.__file__).parent / "migrations")).get_current_head()
    with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/v1/health", timeout=10) as r:
        assert json.load(r)["schemaVersion"] == head

    with urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=10) as r:
        assert r.headers["Content-Security-Policy"] == CSP
        assert "frozen-index-marker" in r.read().decode()

    frozen.stdin.close()
    assert frozen.wait(timeout=5) == 0
