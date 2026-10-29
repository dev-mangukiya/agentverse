import os
import uuid
import pytest
from sqlalchemy import text, inspect
from sqlalchemy.ext.asyncio import create_async_engine
from app.database.migrations import upgrade


async def legacy_upgrade(engine):
    async with engine.begin() as connection:
        await connection.execute(
            text(
                "CREATE TABLE custom_agents (id VARCHAR(12) PRIMARY KEY, name VARCHAR(50) UNIQUE NOT NULL, emoji VARCHAR(10) NOT NULL, description VARCHAR(200), system_prompt TEXT NOT NULL, tools_json TEXT NOT NULL, model VARCHAR(50), is_active INTEGER NOT NULL, created_at TIMESTAMP NOT NULL, updated_at TIMESTAMP NOT NULL)"
            )
        )
        await connection.execute(
            text(
                "INSERT INTO custom_agents VALUES ('legacy', 'helper', 'AG', NULL, 'Preserve instructions', '[]', NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            )
        )
        await connection.run_sync(upgrade)
        await connection.run_sync(upgrade)
        result = (
            await connection.execute(
                text(
                    "SELECT system_prompt, owner_key FROM custom_agents WHERE id='legacy'"
                )
            )
        ).one()
        assert result == ("Preserve instructions", None)
        names = await connection.run_sync(lambda conn: inspect(conn).get_table_names())
        assert {
            "runs",
            "background_jobs",
            "access_sessions",
            "schema_revisions",
        } <= set(names)


@pytest.mark.asyncio
async def test_legacy_sqlite_agent_migration_preserves_data(tmp_path):
    engine = create_async_engine("sqlite+aiosqlite:///" + str(tmp_path / "legacy.db"))
    try:
        await legacy_upgrade(engine)
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_postgresql_schema_migrations():
    url = os.environ.get("TEST_POSTGRES_URL")
    if not url:
        pytest.skip(
            "TEST_POSTGRES_URL is not configured locally; CI provides PostgreSQL"
        )
    admin = create_async_engine(url)
    schema = "test_" + uuid.uuid4().hex
    async with admin.begin() as conn:
        await conn.execute(text(f"CREATE SCHEMA {schema}"))
    engine = create_async_engine(
        url, connect_args={"server_settings": {"search_path": schema}}
    )
    try:
        await legacy_upgrade(engine)
    finally:
        await engine.dispose()
        async with admin.begin() as conn:
            await conn.execute(text(f"DROP SCHEMA {schema} CASCADE"))
        await admin.dispose()
