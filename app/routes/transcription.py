"""Issue short-lived Deepgram access tokens without exposing API keys to the browser.

The token-based auth endpoint avoids creating a new managed API key for every call.
Required server environment variable: DEEPGRAM_API_KEY.
"""
from __future__ import annotations

import os

import httpx
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

router = APIRouter(tags=["transcription"])


class TokenRequest(BaseModel):
    ttl_seconds: int = Field(default=60, ge=30, le=300)


@router.post("/deepgram-token")
async def create_deepgram_token(payload: TokenRequest) -> dict[str, str | int]:
    api_key = os.getenv("DEEPGRAM_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Streaming transcription is not configured. Use manual transcript mode.",
        )

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.post(
                "https://api.deepgram.com/v1/auth/grant",
                headers={"Authorization": f"Token {api_key}"},
                json={"ttl_seconds": payload.ttl_seconds},
            )
            response.raise_for_status()
            body = response.json()
            access_token = body.get("access_token")
            expires_in = body.get("expires_in", payload.ttl_seconds)
            if not access_token:
                raise ValueError("Deepgram response did not contain an access token")
            return {"access_token": access_token, "expires_in": expires_in}
    except (httpx.HTTPError, ValueError) as exc:
        # Do not leak provider response bodies or credentials to the browser.
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                "Deepgram could not issue a temporary token. Check that DEEPGRAM_API_KEY "
                "is valid and has Member-level or higher permissions, then retry."
            ),
        ) from exc
