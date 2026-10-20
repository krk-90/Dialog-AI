"""Call history with local SQLite persistence and optional Supabase cloud storage."""
from __future__ import annotations

import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel, Field

router = APIRouter(tags=["calls"])


class CallCreate(BaseModel):
    prospect: str = Field(default="", max_length=160)
    company: str = Field(default="", max_length=160)
    outcome: str = Field(default="Follow-up", max_length=80)
    stage: int = Field(default=1, ge=1, le=8)
    duration: str = Field(default="", max_length=32)
    transcript: list[dict[str, Any]] = Field(default_factory=list, max_length=500)


def _supabase_configured() -> bool:
    return bool(os.getenv("SUPABASE_URL", "").strip() and os.getenv("SUPABASE_ANON_KEY", "").strip())


def _configuration() -> tuple[str, str]:
    base_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    anon_key = os.getenv("SUPABASE_ANON_KEY", "")
    if not base_url or not anon_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cloud history is not configured. Local SQLite history is active.",
        )
    return base_url, anon_key


def _database_path() -> Path:
    return Path(os.getenv("DIALOG_AI_DB_PATH", "data/dialog-ai.sqlite3"))


def _connect() -> sqlite3.Connection:
    path = _database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS calls (
            id TEXT PRIMARY KEY,
            prospect TEXT NOT NULL DEFAULT '',
            company TEXT NOT NULL DEFAULT '',
            outcome TEXT NOT NULL DEFAULT 'Follow-up',
            stage INTEGER NOT NULL CHECK(stage BETWEEN 1 AND 8),
            duration TEXT NOT NULL DEFAULT '',
            transcript TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL
        )
        """
    )
    connection.commit()
    return connection


def _bearer(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Sign in to access cloud call history.")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Sign in to access cloud call history.")
    return token


async def _supabase_request(method: str, path: str, token: str, payload: dict[str, Any] | None = None) -> Any:
    base_url, anon_key = _configuration()
    headers = {
        "apikey": anon_key,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    if method == "POST":
        headers["Prefer"] = "return=representation"
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.request(method, f"{base_url}/rest/v1/{path}", headers=headers, json=payload)
        if response.status_code in (401, 403):
            raise HTTPException(status_code=response.status_code, detail="Cloud history authorization failed.")
        response.raise_for_status()
        return response.json() if response.content else None
    except HTTPException:
        raise
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Cloud call history is temporarily unavailable.") from exc


def _local_rows() -> list[dict[str, Any]]:
    connection = _connect()
    try:
        rows = connection.execute(
            "SELECT id, prospect, company, outcome, stage, duration, transcript, created_at "
            "FROM calls ORDER BY created_at DESC LIMIT 100"
        ).fetchall()
    finally:
        connection.close()
    return [
        {**dict(row), "transcript": json.loads(row["transcript"])}
        for row in rows
    ]


@router.get("")
async def list_calls(authorization: str | None = Header(default=None)) -> Any:
    if _supabase_configured():
        token = _bearer(authorization)
        return await _supabase_request(
            "GET",
            "calls?select=id,prospect,company,outcome,stage,duration,transcript,created_at&order=created_at.desc&limit=100",
            token,
        )
    return _local_rows()


@router.post("", status_code=201)
async def create_call(payload: CallCreate, authorization: str | None = Header(default=None)) -> Any:
    if _supabase_configured():
        token = _bearer(authorization)
        result = await _supabase_request("POST", "calls", token, payload.model_dump())
        return result

    call_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    record = payload.model_dump()
    connection = _connect()
    try:
        connection.execute(
            "INSERT INTO calls (id, prospect, company, outcome, stage, duration, transcript, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                call_id, record["prospect"], record["company"], record["outcome"],
                record["stage"], record["duration"], json.dumps(record["transcript"]),
                created_at,
            ),
        )
        connection.commit()
    finally:
        connection.close()
    return {**record, "id": call_id, "created_at": created_at}
