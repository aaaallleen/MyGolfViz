from alembic import context
from sqlalchemy import create_engine, event

from mygolfviz_api.models import Base

config = context.config
target_metadata = Base.metadata


def run_migrations_online() -> None:
    engine = create_engine(f"sqlite:///{config.attributes['db_path']}")

    # The sqlite3 driver only opens a transaction before INSERT/UPDATE/DELETE,
    # so CREATE/ALTER/DROP would commit one by one and an upgrade that fails or
    # is killed halfway would leave a half-changed schema. Take over
    # transaction control (SQLAlchemy's documented recipe) so the whole upgrade,
    # including the alembic_version bump, commits or rolls back as one.
    @event.listens_for(engine, "connect")
    def _no_driver_transactions(dbapi_con, _record) -> None:  # noqa: ANN001
        dbapi_con.isolation_level = None

    @event.listens_for(engine, "begin")
    def _begin(conn) -> None:  # noqa: ANN001
        conn.exec_driver_sql("BEGIN")

    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
            transactional_ddl=True,
        )
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


run_migrations_online()
