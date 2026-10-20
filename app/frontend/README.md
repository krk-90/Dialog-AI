# Dialog AI Frontend

React + TypeScript + Vite interface for the Dialog AI cold-call copilot.

## Run locally

```bash
cd app/frontend
npm install
npm run dev
```

## Production build

```bash
npm run build
npm run preview
```

## Configuration

Copy `.env.example` to `.env.local` and set `VITE_API_BASE_URL` to the FastAPI service URL when API integration is enabled.

## Current behavior

- Live-call workspace with eight-stage conversation roadmap.
- Manual transcript composer and browser microphone permission check.
- Stage guidance, response classification, notes, and call wrap-up.
- Call history with search, outcome, duration, and furthest stage reached.
- Responsive layout, accessible labels, keyboard-friendly controls, and reduced-motion support.

The workspace starts with empty call history instead of fabricated sample calls. Calls are saved through FastAPI to local SQLite by default; configure Supabase Auth and RLS for cloud history. Live transcription requires a server-side Deepgram key. Groq coaching is requested on demand and falls back to deterministic guidance if the provider is unavailable. Never put Deepgram or Groq keys in Vite environment variables.
