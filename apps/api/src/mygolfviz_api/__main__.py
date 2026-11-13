from __future__ import annotations

import argparse
import json
import os
import secrets
import socket
import sys
from pathlib import Path

import uvicorn

from .app import create_app
from .config import AlreadyRunning, DataLock, Settings, default_data_dir


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="mygolfviz-api")
    parser.add_argument("--data-dir", type=Path, default=None)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--static-dir", type=Path, default=None)
    args = parser.parse_args(argv)

    data_dir = args.data_dir
    if data_dir is None:
        env = os.environ.get("MYGOLFVIZ_DATA_DIR")
        data_dir = Path(env) if env else default_data_dir()
    data_dir.mkdir(parents=True, exist_ok=True)
    token = os.environ.get("MYGOLFVIZ_TOKEN") or secrets.token_urlsafe(32)

    try:
        lock = DataLock(data_dir)
        lock.__enter__()
    except AlreadyRunning as e:
        print(str(e), file=sys.stderr)
        return 3

    try:
        host = "127.0.0.1"
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((host, args.port))
        port = sock.getsockname()[1]
        settings = Settings(
            data_dir=data_dir,
            token=token,
            host=host,
            port=port,
            static_dir=args.static_dir,
        )
        app = create_app(settings)
        print(
            json.dumps({"port": port, "url": f"http://{host}:{port}/?token={token}"}),
            flush=True,
        )
        server = uvicorn.Server(
            uvicorn.Config(app, host=host, port=port, log_level="info")
        )
        server.run(sockets=[sock])
    finally:
        lock.__exit__(None, None, None)
    return 0


if __name__ == "__main__":
    sys.exit(main())
