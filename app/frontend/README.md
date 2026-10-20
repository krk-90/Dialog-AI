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

The current UI uses demo data. Microphone permission is checked, but actual speech-to-text streaming and persistent API calls require a configured backend provider. No API keys belong in Vite environment variables.
