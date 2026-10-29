"""Ordered schema revisions for both SQLite and PostgreSQL. Errors abort startup."""

from sqlalchemy import inspect, text
from app.database.session import Base

REVISION = "20261029_01"


def upgrade(connection):
    from app.database.models import models  # register models

    Base.metadata.create_all(connection)
    connection.execute(
        text(
            "CREATE TABLE IF NOT EXISTS schema_revisions (version VARCHAR(40) PRIMARY KEY)"
        )
    )
    if connection.execute(
        text("SELECT version FROM schema_revisions WHERE version=:v"), {"v": REVISION}
    ).first():
        return
    additions = {
        "background_jobs": {"available_at": "TIMESTAMP"},
        "runs": {"metrics_json": "TEXT"},
        "users": {"google_subject": "VARCHAR(255)"},
        "conversations": {
            "session_id": "VARCHAR(64)",
            "user_id": "VARCHAR(12)",
            "is_pinned": "INTEGER NOT NULL DEFAULT 0",
        },
        "messages": {
            "attachments_json": "TEXT",
            "interrupted": "INTEGER NOT NULL DEFAULT 0",
            "feedback": "VARCHAR(10)",
            "critic_score": "INTEGER",
            "critic_review": "TEXT",
            "review_status": "VARCHAR(24) NOT NULL DEFAULT 'not_requested'",
        },
        "custom_agents": {"owner_key": "VARCHAR(80)"},
    }
    inspector = inspect(connection)
    for table, fields in additions.items():
        present = {col["name"] for col in inspector.get_columns(table)}
        for name, sqltype in fields.items():
            if name not in present:
                connection.execute(
                    text(f"ALTER TABLE {table} ADD COLUMN {name} {sqltype}")
                )
    connection.execute(
        text(
            "UPDATE background_jobs SET available_at=created_at WHERE available_at IS NULL"
        )
    )
    # Legacy agents used globally unique names. Preserve records while moving to
    # owner-local names; unowned legacy agents remain quarantined for admin review.
    unique_names = [
        c
        for c in inspect(connection).get_unique_constraints("custom_agents")
        if c["column_names"] == ["name"]
    ]
    if unique_names:
        if connection.dialect.name == "sqlite":
            from sqlalchemy import MetaData
            from sqlalchemy.schema import CreateTable

            temporary = models.CustomAgent.__table__.to_metadata(
                MetaData(), name="custom_agents_rebuild"
            )
            connection.execute(CreateTable(temporary))
            columns = ", ".join(
                column.name for column in models.CustomAgent.__table__.columns
            )
            connection.execute(
                text(
                    f"INSERT INTO custom_agents_rebuild ({columns}) SELECT {columns} FROM custom_agents"
                )
            )
            connection.execute(text("DROP TABLE custom_agents"))
            connection.execute(
                text("ALTER TABLE custom_agents_rebuild RENAME TO custom_agents")
            )
        else:
            for constraint in unique_names:
                name = connection.dialect.identifier_preparer.quote(constraint["name"])
                connection.execute(
                    text(f"ALTER TABLE custom_agents DROP CONSTRAINT {name}")
                )
    connection.execute(
        text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_custom_agent_owner_name ON custom_agents (owner_key, name)"
        )
    )
    connection.execute(
        text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_subject ON users (google_subject)"
        )
    )
    connection.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_messages_conversation_created ON messages (conversation_id, created_at, id)"
        )
    )
    connection.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_custom_agents_owner_key ON custom_agents (owner_key)"
        )
    )
    connection.execute(
        text("UPDATE conversations SET session_id=NULL WHERE user_id IS NOT NULL")
    )
    connection.execute(
        text("INSERT INTO schema_revisions (version) VALUES (:v)"), {"v": REVISION}
    )
