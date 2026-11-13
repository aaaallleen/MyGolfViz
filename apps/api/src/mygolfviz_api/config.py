from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from filelock import FileLock, Timeout
from platformdirs import user_data_dir

KNOWN_PARSER_VERSIONS: frozenset[str] = frozenset({"1.0.0"})


class AlreadyRunning(Exception):
    pass


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    token: str
    host: str = "127.0.0.1"
    port: int = 8765
    static_dir: Path | None = None
    allowed_hosts: tuple[str, ...] | None = None

    def resolved_allowed_hosts(self) -> tuple[str, ...]:
        if self.allowed_hosts is not None:
            return self.allowed_hosts
        return (f"127.0.0.1:{self.port}", f"localhost:{self.port}")


def default_data_dir() -> Path:
    return Path(user_data_dir("MyGolfViz", appauthor=False, roaming=True))


class DataLock:
    def __init__(self, data_dir: Path) -> None:
        self._lock = FileLock(Path(data_dir) / "mygolfviz.lock", timeout=0)

    def __enter__(self) -> "DataLock":
        try:
            self._lock.acquire()
        except Timeout:
            raise AlreadyRunning(
                "MyGolfViz is already running with this data folder"
            ) from None
        return self

    def __exit__(self, *exc: object) -> None:
        self._lock.release()
