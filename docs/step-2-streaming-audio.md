# Step 2: Streaming audio foundation

## Scope

This milestone provides a FastAPI application, health endpoint, backend-issued temporary Deepgram credentials, and a browser hook for streaming microphone audio. It intentionally does not implement AI coaching or call-stage detection.

## Run locally

```bash
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Check `http://localhost:8000/health`. Without `DEEPGRAM_API_KEY`, the token endpoint returns a safe 503 response and manual transcript entry remains available.

Set `DEEPGRAM_API_KEY` in your local environment or Render environment settings. Do not commit a real key. The frontend requests `POST /api/transcription/deepgram-token`; the permanent provider key never goes to the browser.

## Frontend

Set `VITE_API_BASE_URL=http://localhost:8000` in `app/frontend/.env.local` for local development. Vite proxies the token endpoint to FastAPI. For a deployed frontend, set `VITE_API_BASE_URL` to the backend origin and rebuild the frontend.

## Limitations

- This captures the selected computer microphone only. It does not automatically capture a desktop calling application's remote audio.
- Diarization labels distinct voices but does not reliably identify which one is the salesperson. Treat voice labels as provisional until the user assigns roles.
- Transcripts are not persisted to Supabase in this milestone.
- Use recording/transcription only with appropriate consent and in compliance with applicable laws.

## Offline tests

```bash
pytest -q
```

Tests verify the health endpoint, TTL validation, and safe manual-mode response when no provider key is configured. Real transcription requires a valid Deepgram credential and browser microphone permission.
