from __future__ import annotations

import argparse
import json
import logging
import os
import secrets
import signal
import socket
import sys
import threading
import time
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

    # Until uvicorn installs its own handlers, a quit request (SIGTERM/SIGINT, or
    # the parent closing stdin) only sets this flag: startup, including any
    # database upgrade, finishes or is skipped cleanly and the process exits 0.
    stop = threading.Event()
    _install_early_stop(stop)
    if args.exit_with_stdin:
        threading.Thread(target=_exit_on_stdin_eof, args=(stop,), daemon=True).start()

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
            app = create_app(settings, on_migrating=_announce_migrating)
        except Exception as e:
            logging.getLogger("mygolfviz_api").exception("startup failed")
            print(f"MyGolfViz couldn't start: {e}", file=sys.stderr)
            return 4
        if stop.is_set():
            app.state.engine.dispose()
            sock.close()
            return 0
        print(
            json.dumps({"port": port, "url": f"http://{host}:{port}/?token={token}"}),
            flush=True,
        )
        config = uvicorn.Config(app, host=host, port=port, log_level="info")
        # Config() runs dictConfig, which strips handlers from the uvicorn
        # logger; re-attach the file handler afterwards.
        attach_log_handler(settings)
        server = _Server(config, stop)
        server.run(sockets=[sock])
    finally:
        lock.__exit__(None, None, None)
    return 0


def _install_early_stop(stop: threading.Event) -> None:
    def request_stop(sig, frame) -> None:  # noqa: ANN001
        # A second Ctrl-C aborts startup at once, like the default handler. An
        # interrupted database upgrade rolls back, so this is safe.
        if stop.is_set() and sig == signal.SIGINT:
            signal.default_int_handler(sig, frame)
        stop.set()

    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)


def _announce_migrating() -> None:
    """Tell the parent (the Mac app) that a database upgrade is starting, so it
    waits longer than its usual startup limit."""
    print(json.dumps({"status": "migrating"}), flush=True)
    # Test hook: the desktop end-to-end tests stretch the upgrade to watch the splash.
    delay_ms = os.environ.get("MYGOLFVIZ_TEST_MIGRATION_DELAY_MS")
    if delay_ms:
        time.sleep(int(delay_ms) / 1000)


class _Server(uvicorn.Server):
    """uvicorn re-raises a captured SIGTERM once it has shut down, which would
    turn a graceful stop into exit status -15. We want a clean 0 and a released
    lock, so shut down on the signal without recording it for re-raise."""

    # (uvicorn 0.54 re-raises captured signals after shutdown.) Otherwise this
    # mirrors upstream: a second SIGINT forces exit.
    def __init__(self, config: uvicorn.Config, stop: threading.Event) -> None:
        super().__init__(config)
        self._stop = stop

    async def on_tick(self, counter: int) -> bool:
        # A stop requested before uvicorn's handlers were installed, or by stdin EOF.
        if self._stop.is_set():
            self.should_exit = True
        return await super().on_tick(counter)

    def handle_exit(self, sig, frame) -> None:  # noqa: ANN001
        if self.should_exit and sig == signal.SIGINT:
            self.force_exit = True
        else:
            self.should_exit = True


def _exit_on_stdin_eof(stop: threading.Event) -> None:
    """Ask for a graceful shutdown once the parent closes our stdin."""
    # os.read, not sys.stdin: a daemon thread blocked inside the buffered reader
    # holds its lock, and the interpreter aborts ("Fatal Python error") if the
    # process exits meanwhile, e.g. "already running" or a quit during startup.
    try:
        while os.read(0, 4096):
            pass
    except OSError:
        pass
    stop.set()


if __name__ == "__main__":
    sys.exit(main())
