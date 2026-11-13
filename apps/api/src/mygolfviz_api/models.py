from __future__ import annotations

from typing import Any

from sqlalchemy import JSON, Float, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    date: Mapped[str] = mapped_column(String, nullable=False)
    notes: Mapped[str | None] = mapped_column(String)
    handedness: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[str] = mapped_column(String, nullable=False)
    updated_at: Mapped[str] = mapped_column(String, nullable=False)


class Import(Base):
    __tablename__ = "imports"
    __table_args__ = (UniqueConstraint("session_id", "sha256"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False
    )
    original_filename: Mapped[str] = mapped_column(String, nullable=False)
    display_name: Mapped[str | None] = mapped_column(String)
    sha256: Mapped[str] = mapped_column(String, nullable=False)
    byte_length: Mapped[int] = mapped_column(Integer, nullable=False)
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False)
    parser_version: Mapped[str] = mapped_column(String, nullable=False)
    shot_count: Mapped[int] = mapped_column(Integer, nullable=False)
    summary_row_count: Mapped[int] = mapped_column(Integer, nullable=False)
    warnings: Mapped[Any] = mapped_column(JSON, nullable=False)
    imported_at: Mapped[str] = mapped_column(String, nullable=False)


class Shot(Base):
    __tablename__ = "shots"
    __table_args__ = (
        UniqueConstraint("import_id", "source_row"),
        Index("ix_shots_club", "club"),
        Index("ix_shots_import_id", "import_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    import_id: Mapped[str] = mapped_column(
        ForeignKey("imports.id", ondelete="CASCADE"), nullable=False
    )
    source_row: Mapped[int] = mapped_column(Integer, nullable=False)
    shot_label: Mapped[str | None] = mapped_column(String)
    club: Mapped[str | None] = mapped_column(String)
    shot_type: Mapped[str | None] = mapped_column(String)
    mode: Mapped[str | None] = mapped_column(String)
    location: Mapped[str | None] = mapped_column(String)
    measurements: Mapped[Any] = mapped_column(JSON, nullable=False)
    raw: Mapped[Any] = mapped_column(JSON, nullable=False)
    flags: Mapped[Any] = mapped_column(JSON, nullable=False)


class Exclusion(Base):
    __tablename__ = "exclusions"

    session_id: Mapped[str] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), primary_key=True
    )
    sha256: Mapped[str] = mapped_column(String, primary_key=True)
    source_row: Mapped[int] = mapped_column(Integer, primary_key=True)
    excluded_at: Mapped[str] = mapped_column(String, nullable=False)


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[Any] = mapped_column(JSON, nullable=False)
    updated_at: Mapped[str] = mapped_column(String, nullable=False)


class TargetRange(Base):
    __tablename__ = "target_ranges"
    __table_args__ = (UniqueConstraint("club", "metric"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    club: Mapped[str] = mapped_column(String, nullable=False)
    metric: Mapped[str] = mapped_column(String, nullable=False)
    low: Mapped[float | None] = mapped_column(Float)
    high: Mapped[float | None] = mapped_column(Float)
    updated_at: Mapped[str] = mapped_column(String, nullable=False)
