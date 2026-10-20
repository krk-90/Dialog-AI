"""Issue short-lived Deepgram access tokens without exposing API keys to the browser.

Register this router in the existing FastAPI app as /api/transcription.
Required server environment variable: DEEPGRAM_API_KEY.
"""
from __future__ import annotations

import os
from typing import Annotated

import httpx
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

router = APIRouter(tags=["transcription"])


class TokenRequest(BaseModel):
    ttl_seconds: int = Field(default=60, ge=30, le=300)


@router.post("/deepgram-token")
async def create_deepgram_token(
    payload: TokenRequest,
) -> dict[str, str | int]:
    api_key = os.getenv("DEEPGRAM_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Streaming transcription is not configured. Use manual transcript mode.",
        )
    async with httpx.AsyncClient(timeout=8.0) as client:
        try:
            response = await client.post(
                "https://api.deepgram.com/v1/keys",
                headers={"Authorization": f"Token {api_key}", "Content-Type": "application/json"},
                json={
                    "comment": "Dialog AI temporary browser transcription key",
                    "scopes": ["usage:write"],
                    "tags": ["dialog-ai", "ephemeral-transcription"],
                    "time_to_live_in_seconds": payload.ttl_seconds,
                },
            )
            response.raise_for_status()
            body = response.json()
            key = body.get("key")
            if not key:
                raise ValueError("Deepgram response did not contain a temporary key")
            return {"access_token": key, "expires_in": payload.ttl_seconds}
        except (httpx.HTTPError, ValueError) as exc:
            # Keep provider response bodies and credentials out of the client error.
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not create a temporary transcription token. Use manual transcript mode.",
            ) from exc
