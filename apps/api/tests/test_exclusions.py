from __future__ import annotations

from test_imports import NAMES, NEW_SESSION, entry, import_all, post_import


def _ids(client, sid):
    return [i["id"] for i in client.get(f"/api/v1/sessions/{sid}/imports").json()]



