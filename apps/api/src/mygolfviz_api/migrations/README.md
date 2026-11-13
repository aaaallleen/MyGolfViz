# Database migrations

The backend upgrades `mygolfviz.sqlite3` to the latest revision on every start (`migrate.upgrade`).

## What protects the owner's data

- **Backup first.** Before upgrading an existing database, a copy goes to `backups/`, named after the
  revision it was taken from. For each revision the first copy (the true pre-upgrade one) and the latest
  are kept, for the five most recent revisions.
- **All or nothing.** `env.py` runs the whole upgrade, including the `alembic_version` bump, in one
  SQLite transaction. An upgrade that fails, or is killed, leaves the database exactly as it was.
- **Time.** The backend prints `{"status": "migrating"}` before an upgrade. The Mac app then allows up to
  10 minutes instead of 30 seconds and its splash says "Updating your data…". Keep upgrades well inside that.
- **Drift test.** `tests/test_migration_safety.py::test_models_match_the_migrations` fails if `models.py`
  and the migrations disagree. Change both together.

## Writing a migration

- Use `op.batch_alter_table(...)` for changes to existing tables (SQLite cannot alter most things in place).
- Constraints in `models.py` are named by `NAMING_CONVENTION` (for example `uq_imports_session_id_sha256`).
  The constraints created by `0001_initial` have **no names** in existing databases. To drop or change one,
  pass the convention so Alembic can find it:

  ```python
  from mygolfviz_api.models import NAMING_CONVENTION

  with op.batch_alter_table("imports", naming_convention=NAMING_CONVENTION) as batch:
      batch.drop_constraint("uq_imports_session_id_sha256", type_="unique")
  ```
- Add a test that upgrades a database holding real rows from the previous revision and checks they survive.
