from __future__ import annotations

import argparse
import json
import logging
import os
import secrets
import socket
import sys
import threading
from pathlib import Path

import uvicorn

from .app import attach_log_handler, create_app
from .config import AlreadyRunning, DataLock, Settings, default_data_dir


def open_listening_socket(host: str, port: int) -> socket.socket:
    """Bind and listen (port 0 picks a free one).

    Listening before the port line is printed means a client that connects as
    soon as it reads that line is queued until uvicorn starts accepting,
    instead of being refused.
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind((host, port))
    sock.listen(128)
    return sock


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="mygolfviz-api")
    parser.add_argument("--data-dir", type=Path, default=None)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--static-dir", type=Path, default=None)
    parser.add_argument("--exit-with-stdin", action="store_true")
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
        try:
            sock = open_listening_socket(host, args.port)
            port = sock.getsockname()[1]
            settings = Settings(
                data_dir=data_dir,
                token=token,
                host=host,
                port=port,
                static_dir=args.static_dir,
            )
            app = create_app(settings)
        except Exception as e:
            logging.getLogger("mygolfviz_api").exception("startup failed")
            print(f"MyGolfViz couldn't start: {e}", file=sys.stderr)
            return 4
        print(
            json.dumps({"port": port, "url": f"http://{host}:{port}/?token={token}"}),
            flush=True,
        )
        config = uvicorn.Config(app, host=host, port=port, log_level="info")
        # Config() runs dictConfig, which strips handlers from the uvicorn
        # logger; re-attach the file handler afterwards.
        attach_log_handler(settings)
        server = _Server(config)
        if args.exit_with_stdin:
            threading.Thread(target=_exit_on_stdin_eof, args=(server,), daemon=True).start()
        server.run(sockets=[sock])
    finally:
        lock.__exit__(None, None, None)
    return 0


class _Server(uvicorn.Server):
    """uvicorn re-raises a captured SIGTERM once it has shut down, which would
    turn a graceful stop into exit status -15. We want a clean 0 and a released
    lock, so shut down on the signal without recording it for re-raise."""

    def handle_exit(self, sig, frame) -> None:  # noqa: ANN001
        self.should_exit = True


def _exit_on_stdin_eof(server: uvicorn.Server) -> None:
    """Ask uvicorn to shut down gracefully once the parent closes our stdin."""
    try:
        while sys.stdin.buffer.read(4096):
            pass
    except (OSError, ValueError):
        pass
    server.should_exit = True


if __name__ == "__main__":
    sys.exit(main())
