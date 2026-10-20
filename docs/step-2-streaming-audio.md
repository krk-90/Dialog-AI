# Step 2: Streaming audio milestone

## Scope
This milestone adds the first streaming transcription slice, not full call recording or full-duplex system audio capture.

- Browser microphone audio is streamed in small MediaRecorder chunks to Deepgram Nova-2.
- Interim and final transcript results are exposed by a reusable React hook.
- Deepgram diarization is enabled. Speaker IDs are only voice clusters; speaker 0 is provisionally displayed as "You" and speaker 1 as "Prospect". This assignment is a heuristic and must be configurable/confirmed in a real call.
- The browser never receives the long-lived Deepgram API key. The backend endpoint must issue a short-lived token.
- If permissions, credentials, networking, browser support, or the provider fail, the hook returns an actionable error and manual transcript entry remains available.
- Desktop system/call audio is not included in this first slice. Browser getUserMedia only captures the selected microphone. System audio requires a separate user-initiated screen/tab audio capture path and browser/OS support.

## Integration
1. Install `httpx` in the backend environment if not already installed.
2. Save `app/routes/transcription.py` and include `router` in the existing FastAPI application with prefix `/api/transcription`. The route then becomes `POST /api/transcription/deepgram-token`.
3. Set `DEEPGRAM_API_KEY` in the backend host's secret environment settings. Never add it to Vite variables or commit a real key.
4. Import `useDeepgramTranscription` from `src/hooks/useDeepgramTranscription`. Render `segments` and append only final segments to persisted transcript history. Interim segments should be replaced as new interim results arrive.
5. For production, add authenticated-user/session checks and rate limits to the token endpoint before exposing it publicly.

## Limitations
- This endpoint currently creates a short-lived key through Deepgram's API. Verify the exact key-creation API permissions and payload against the Deepgram project/account before deployment.
- The diarization labels are provisional, not identity verification.
- A browser cannot reliably capture arbitrary system audio. Implement display-media audio as a separately consented source after the microphone path is verified.
- No live credentials were supplied, so end-to-end provider verification is pending.
