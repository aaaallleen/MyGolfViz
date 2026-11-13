"""Print the OpenAPI schema as stable JSON; `npm run api:types` feeds it to openapi-typescript."""

import json
import tempfile
from pathlib import Path

from .app import create_app
from .config import Settings


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        settings = Settings(data_dir=Path(tmp), token="openapi-dump")
        print(json.dumps(create_app(settings).openapi(), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
