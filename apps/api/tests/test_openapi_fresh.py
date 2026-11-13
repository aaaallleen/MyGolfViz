import json
from pathlib import Path

from mygolfviz_api.app import create_app

COMMITTED = Path(__file__).resolve().parents[2] / "web" / "src" / "local" / "openapi.json"


def test_committed_openapi_is_fresh(settings):
    current = json.loads(json.dumps(create_app(settings).openapi()))
    assert json.loads(COMMITTED.read_text()) == current, "run `npm run api:types`"
