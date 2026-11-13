# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for the backend that ships inside the Mac app: `npm run api:bin` builds
# apps/api/dist/mygolfviz-api/mygolfviz-api (one folder, arm64).
from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules

SRC = Path(SPECPATH).parent / "src"
MIGRATIONS = SRC / "mygolfviz_api" / "migrations"

# Alembic runs env.py and versions/*.py from disk (migrate.py points script_location at
# <package>/migrations), so they ship as source files, not as compiled modules.
datas = [
    (str(MIGRATIONS / "env.py"), "mygolfviz_api/migrations"),
    (str(MIGRATIONS / "script.py.mako"), "mygolfviz_api/migrations"),
] + [(str(p), "mygolfviz_api/migrations/versions") for p in sorted((MIGRATIONS / "versions").glob("*.py"))]

hiddenimports = collect_submodules("uvicorn") + [
    # Imported by the migration scripts, which PyInstaller does not analyse.
    "alembic.context",
    "alembic.op",
    "mygolfviz_api.models",
    "sqlalchemy.dialects.sqlite",
]

a = Analysis(
    ["entry.py"],
    pathex=[str(SRC)],
    datas=datas,
    hiddenimports=hiddenimports,
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="mygolfviz-api",
    console=True,
    target_arch="arm64",
    upx=False,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    name="mygolfviz-api",
    upx=False,
)
