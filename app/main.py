"""Dialog AI API application."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from app.routes.transcription import router as transcription_router
from app.routes.calls import router as calls_router
from app.routes.coaching import router as coaching_router

app = FastAPI(title="Dialog AI API", version="0.1.0")

# Set FRONTEND_ORIGINS as a comma-separated list in deployment.
import os
origins = [
    origin.strip()
    for origin in os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:5173,https://dialog-ai-ten.vercel.app",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.get("/", tags=["health"])
async def root() -> dict[str, str]:
    """Human-friendly service root so opening the Render URL isn't a 404."""
    return {
        "service": "dialog-ai-api",
        "status": "ok",
        "health": "/health",
        "docs": "/docs",
    }


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    """Health endpoint intentionally does not require provider credentials."""
    return {"status": "ok", "service": "dialog-ai-api"}


app.include_router(transcription_router, prefix="/api/transcription")
app.include_router(calls_router, prefix="/api/calls")
app.include_router(coaching_router, prefix="/api/coaching")
