"""Authenticated call-history API backed by Supabase REST and row-level security."""
from __future__ import annotations

import os
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


def _configuration() -> tuple[str, str]:
    base_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    anon_key = os.getenv("SUPABASE_ANON_KEY", "")
    if not base_url or not anon_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cloud call history is not configured. Local browser history remains available.",
        )
    return base_url, anon_key


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


@router.get("")
async def list_calls(authorization: str | None = Header(default=None)) -> Any:
    token = _bearer(authorization)
    return await _supabase_request(
        "GET",
        "calls?select=id,prospect,company,outcome,stage,duration,transcript,created_at&order=created_at.desc&limit=100",
        token,
    )


@router.post("", status_code=201)
async def create_call(payload: CallCreate, authorization: str | None = Header(default=None)) -> Any:
    token = _bearer(authorization)
    # The database assigns user_id from auth.uid(); never accept a client-supplied owner.
    return await _supabase_request("POST", "calls", token, payload.model_dump())
