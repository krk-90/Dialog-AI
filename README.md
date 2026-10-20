# Dialog AI

**A desktop-first cold-call copilot** with live transcription, structured call stages, and on-demand AI coaching.

Dialog AI is a React + TypeScript frontend backed by FastAPI. Deepgram handles streaming speech-to-text, and Groq can generate concise coaching suggestions. The app keeps a manual transcript path available when live audio or provider credentials are unavailable.

## Current capabilities

- Eight-stage call guide: opening, reason for calling, permission, discovery, problem impact, value alignment, objection handling, and close.
- Live transcription through a short-lived Deepgram token issued by the backend.
- Audio source choices for microphone, browser-shared tab/desktop audio, or both when supported by the browser.
- Interim and final transcript segments, with provisional speaker labels.
- Manual transcript entry when streaming is unavailable.
- On-demand Groq coaching using the current stage and a bounded recent transcript context.
- Deterministic coaching fallback when Groq is not configured or unavailable.
- Persistent backend call history in local SQLite by default, with optional Supabase cloud history.
- Light/dark theme, FastAPI health endpoint, backend tests, frontend production build, and deployment smoke evaluation.

## Architecture

```text
React + Vite + TypeScript
  ├── Live call workspace and stage guide
  ├── useDeepgramTranscription hook
  ├── Browser audio capture + WebSocket
  └── Call history loaded and saved through the API
          │ HTTP
          ▼
FastAPI
  ├── GET  /health
  ├── POST /api/transcription/deepgram-token
  └── POST /api/coaching/suggestion
          │
          ├── Deepgram API (streaming transcription)
          ├── Groq API (on-demand coaching)
          └── Supabase REST (user-scoped call history with RLS)
```

## Run locally

Requirements: Python 3.11+ (3.12 recommended), Node.js 20+, and npm.

### 1. Backend

```bash
python -m venv .venv
# Windows PowerShell:
.venv\\Scripts\\Activate.ps1
# macOS/Linux:
# source .venv/bin/activate

pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload
```

The API runs at `http://localhost:8000`; health check: `http://localhost:8000/health`.

### 2. Frontend

In another terminal:

```bash
cd app/frontend
npm ci
copy .env.example .env
npm run dev
```

Open the Vite URL shown in the terminal, normally `http://localhost:5173`. The Vite development server proxies `/api` requests to the local backend.

On macOS/Linux, use `cp .env.example .env` instead of `copy`.

## Environment configuration

Backend `.env`:

| Variable | Required | Purpose |
| --- | --- | --- |
| `DEEPGRAM_API_KEY` | Only for live transcription | Server-side key used to issue temporary browser credentials |
| `GROQ_API_KEY` | No | Server-side key for AI coaching; built-in fallback works without it |
| `GROQ_MODEL` | No | Groq model name; defaults to `llama-3.3-70b-versatile` |
| `FRONTEND_ORIGINS` | For deployment | Comma-separated allowed frontend origins |
| `DIALOG_AI_LOCAL_HISTORY` | No | Set `true` for unauthenticated local SQLite history; set `false` on public deployments |
| `DIALOG_AI_DB_PATH` | No | Local SQLite file path; defaults to `data/dialog-ai.sqlite3` |
| `SUPABASE_URL` | Optional | Supabase project URL for cloud call history; configure with the anon key to enable cloud mode |
| `SUPABASE_ANON_KEY` | Optional | Supabase public anon key used server-side with the signed-in user JWT; never use a service-role key |

Frontend `app/frontend/.env`:

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | Leave blank for the local Vite proxy; set to the backend origin for a separately deployed frontend |
| `VITE_SUPABASE_URL` | Optional | Supabase project URL; enables sign-in and cloud call history |
| `VITE_SUPABASE_ANON_KEY` | Optional | Supabase public anon key; safe for browser use when RLS is enabled |

**Never put Deepgram or Groq secrets in frontend variables or commit them to Git.** For Render, set backend secrets in the service environment. For a separately hosted frontend, set `VITE_API_BASE_URL` and configure `FRONTEND_ORIGINS` to match the deployed origin.

## Demo workspace

Use **Explore demo** on the sign-in screen or the sidebar to inspect the workspace without creating an account. The demo includes clearly labelled sample call history and saved transcript details. Calls created in demo mode are stored only in that browser under a separate local-storage key; they are not sent to the backend or mixed with an authenticated user's cloud history. Open a call from the history table to review its saved transcript, outcome, stage, and duration.

For real calls, configure Supabase Auth and cloud history as described below. In local development, Vite proxies `/api/calls` to FastAPI alongside the transcription and coaching endpoints.

## Supabase cloud history

1. Create a Supabase project.
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL editor to create the calls table and row-level security policies.
3. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in the backend environment.
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the frontend environment and rebuild/redeploy it.
5. Enable the desired email sign-up / confirmation settings in Supabase Auth.

When Supabase is configured, the UI requires sign-in, loads the signed-in user's call history, and saves completed calls through the backend. Supabase RLS scopes rows to `auth.uid()`; the backend never accepts a client-supplied `user_id`. Without Supabase configuration, the backend stores call history in `data/dialog-ai.sqlite3`. This persists across local restarts. Render's default filesystem is ephemeral, so configure Supabase for durable deployed history. Unauthenticated SQLite history is disabled by the Render blueprint.

## Tests and evaluation

Run backend tests:

```bash
pytest -q
```

Run a frontend production build:

```bash
cd app/frontend
npm ci
npm run build
```

Run API smoke evaluation against a local or deployed backend:

```bash
python evaluation/smoke_eval.py --base-url http://127.0.0.1:8000 --output evaluation-report.json
```

The smoke report records pass rate and endpoint latency for health, coaching, and invalid-stage validation. It is a deployment smoke test, **not** a quality evaluation of a 100-call dataset or proof of real provider latency.

## Important limitations

- Desktop/tab capture requires browser permission and the user to select a share target with audio enabled. The app does not silently capture arbitrary system audio.
- Speaker labels are provisional diarization labels such as Voice 1 / Voice 2. They do not reliably identify which speaker is the salesperson.
- AI coaching is requested when the user clicks **Refresh coaching**; transcript text is not automatically streamed to Groq.
- Without Supabase configuration, call history is stored in a local SQLite file and is not synced between devices. Use Supabase for shared cloud history.
- Cloud history depends on applying the SQL schema, enabling Supabase Auth, and setting the matching environment variables.
- Add authentication, authorization, rate limiting, consent UX, retention controls, and privacy review before exposing this app to public or production call data.
- A successful build or smoke test does not verify provider credentials or a live deployed call. Test those in the configured environment.

## Deployment

The repository includes a Render blueprint for the FastAPI service. Configure `DEEPGRAM_API_KEY`, optional `GROQ_API_KEY`, and `FRONTEND_ORIGINS` in Render. For a separate frontend host, set `VITE_API_BASE_URL` to the backend origin and redeploy the frontend.

## Privacy and consent

Only capture calls when you have the required consent and legal basis. Treat transcripts as sensitive customer data, avoid logging secrets or full transcripts unnecessarily, and define retention/deletion rules before production use.

## Diagnose Supabase connectivity

To test Supabase independently of Groq and Deepgram, configure `SUPABASE_URL` and `SUPABASE_ANON_KEY` in the backend `.env`, then run from the repository root:

```bash
python evaluation/supabase_check.py
```

The script queries `public.calls` with `select=id&limit=0` and checks Auth health, reports sanitized provider error messages, and never prints the configured key. It sends publishable keys through `apikey` only; legacy JWT anon keys are also sent as a Bearer token. If REST returns 401, verify the URL and key are from the same project and that the GitHub Actions environment has the current public key. It does not test row-level security for a signed-in user.
