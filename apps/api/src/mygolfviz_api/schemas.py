from __future__ import annotations

import re
from datetime import date as _date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel

Handedness = Literal["right", "left"]
Flag = Literal["no_measurements", "check_face_to_path", "check_smash"]
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


def _check_date(v: str) -> str:
    if not _DATE_RE.match(v):
        raise ValueError("date must be YYYY-MM-DD")
    _date.fromisoformat(v)  # rejects impossible calendar dates
    return v


def _check_name(v: str) -> str:
    v = v.strip()
    if not 1 <= len(v) <= 200:
        raise ValueError("name must be 1-200 characters")
    return v


class SessionIn(CamelModel):
    name: str
    date: str
    notes: str = ""
    handedness: Handedness = "right"

    _name = field_validator("name")(_check_name)
    _date = field_validator("date")(_check_date)


class SessionPatch(CamelModel):
    name: str | None = None
    date: str | None = None
    notes: str | None = None
    handedness: Handedness | None = None

    @field_validator("name")
    @classmethod
    def _n(cls, v: str | None) -> str | None:
        return None if v is None else _check_name(v)

    @field_validator("date")
    @classmethod
    def _d(cls, v: str | None) -> str | None:
        return None if v is None else _check_date(v)

    @model_validator(mode="after")
    def _no_null_date(self) -> "SessionPatch":
        if "date" in self.model_fields_set and self.date is None:
            raise ValueError("date cannot be cleared")
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("name cannot be cleared")
        return self


class ClubCount(CamelModel):
    club: str
    count: int


class SessionRow(CamelModel):
    id: str
    name: str
    date: str
    notes: str
    handedness: Handedness
    created_at: str
    updated_at: str
    shot_count: int
    file_count: int
    clubs: list[ClubCount]


# --- import payload -------------------------------------------------------

Num = Annotated[float | None, Field(strict=True, allow_inf_nan=False)]


class Measurements(BaseModel):
    """27 explicit keys named exactly like the TS MeasurementKey values; all required."""

    model_config = ConfigDict(extra="forbid")

    ballSpeed: Num
    clubSpeed: Num
    smash: Num
    carry: Num
    total: Num
    roll: Num
    swingH: Num
    spin: Num
    height: Num
    flightTime: Num
    aoa: Num
    spinLoft: Num
    swingV: Num
    spinAxis: Num
    lateral: Num
    ftp: Num
    ftt: Num
    dynamicLoft: Num
    clubPath: Num
    launchH: Num
    launchV: Num
    lowPoint: Num
    descentV: Num
    curve: Num
    impactLateral: Num
    impactVertical: Num
    altitude: Num


class ParsedShotIn(CamelModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="forbid"
    )

    source_row: int = Field(ge=1)
    shot_label: str | None = None
    club: str = Field(min_length=1)
    shot_type: str | None = None
    mode: str | None = None
    location: str | None = None
    m: Measurements
    raw: dict[str, str]
    flags: list[Flag] = []


class WarningIn(BaseModel):
    code: str
    message: str
    row: int | None = None
    column: str | None = None


class ImportFileIn(CamelModel):
    field: str
    name: str
    parser_version: str
    summary_row_count: int = Field(ge=0)
    warnings: list[WarningIn] = []
    shots: list[ParsedShotIn]
    accept_cross_session_duplicate: bool = False


class ImportDestination(CamelModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="forbid"
    )

    session_id: str | None = None
    new_session: SessionIn | None = None

    @model_validator(mode="after")
    def _exactly_one(self) -> "ImportDestination":
        if (self.session_id is None) == (self.new_session is None):
            raise ValueError("destination needs exactly one of sessionId or newSession")
        return self


class ImportManifestIn(CamelModel):
    destination: ImportDestination
    # Files are validated one by one so a bad file does not fail the batch.
    files: list[dict]


class FileResult(CamelModel):
    field: str
    name: str
    status: Literal["imported", "skipped_duplicate", "invalid"]
    import_id: str | None = None
    shot_count: int | None = None
    reason: str | None = None
    warnings: list[dict] = []


class ImportResponse(CamelModel):
    session: SessionRow
    results: list[FileResult]


class CheckRequest(CamelModel):
    sha256s: list[str]
    session_id: str | None = None


class SessionRef(CamelModel):
    id: str
    name: str


class CheckResult(CamelModel):
    sha256: str
    in_destination: bool
    other_sessions: list[SessionRef]


class CheckResponse(CamelModel):
    results: list[CheckResult]
