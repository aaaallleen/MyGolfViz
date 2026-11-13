import pytest
from fastapi.testclient import TestClient

from mygolfviz_api.app import create_app
from mygolfviz_api.config import Settings


@pytest.fixture
def settings(tmp_path):
    return Settings(data_dir=tmp_path, token="t", allowed_hosts=("testserver",))


@pytest.fixture
def client(settings):
    with TestClient(create_app(settings), headers={"X-MyGolfViz-Token": "t"}) as c:
        yield c


@pytest.fixture
def anon(settings):
    with TestClient(create_app(settings)) as c:
        yield c
