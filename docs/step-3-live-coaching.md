# Step 3: On-demand live coaching

## What changed

- Adds `POST /api/coaching/suggestion` to the FastAPI backend.
- Uses Groq server-side when `GROQ_API_KEY` is configured.
- Sends only the current stage, response type, notes, and up to eight recent transcript lines when the user explicitly clicks **Refresh coaching**.
- Uses deterministic built-in guidance when the Groq key is missing or the provider request fails.
- Limits input sizes and transcript context; provider errors are not returned to the browser.
- Adds the coaching API to the local Vite proxy and configures Render environment variable names.

## Configuration

Set `GROQ_API_KEY` in the backend host's secret environment settings. Do not add it to frontend variables or commit a real key. `GROQ_MODEL` defaults to `llama-3.3-70b-versatile`.

If no key is configured, the endpoint still returns a useful manual coaching suggestion with `source: "fallback"`. The UI also falls back to the current stage's guidance if the API is unreachable.

## API example

```http
POST /api/coaching/suggestion
Content-Type: application/json
```

```json
{
  "stage": "Discovery",
  "purpose": "Understand their current situation",
  "response_type": "Other",
  "notes": "",
  "transcript": ["Prospect: We use spreadsheets for this today."]
}
```

## Safety and current limits

- Coaching is on-demand, not continuously triggered, so transcript text is not sent to the LLM until the user clicks the button.
- Do not record or transmit calls without appropriate consent and legal basis.
- This milestone does not add authentication, Supabase persistence, objection classification, or latency benchmarking. Add authentication and request rate limits before exposing the API publicly.
- Real Groq inference has not been verified unless a valid `GROQ_API_KEY` is configured in the deployment environment.

## Verification

Run `pytest -q` for backend tests and `npm ci && npm run build` from `app/frontend`.
