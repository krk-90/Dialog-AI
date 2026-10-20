# Step 1: Frontend foundation and implementation decisions

## Agreed product direction

- Adaptive theme: dark by default with a persistent light/dark toggle.
- Audio target for a later milestone: microphone plus system/call audio where browser and operating-system permissions support it.
- Transcription target: streaming partial and final transcript segments.
- Guidance target: live contextual suggestions plus a manual request action.
- Resilience: the call flow must remain usable if the LLM is unavailable. Deterministic stage guidance and transcript capture are the fallback, not a blank screen.
- Dataset: analyze the provided 100 anonymized cold-call transcripts for patterns and evidence. Do not present synthetic examples as dataset findings.
- Persistence: Supabase Postgres will be the canonical store for calls, transcript segments, stage outcomes, and derived dataset insights. Keep credentials server-side; never expose a Supabase service-role key in frontend code.

## Step boundaries

1. Frontend foundation: adaptive theme, layout baseline, honest demo/offline status, and branch isolation.
2. Audio capture and streaming transcription, with explicit source selection and graceful permission/provider errors.
3. Call intelligence: transcript-driven stage and objection signals, AI suggestions when available, deterministic fallback at all times.
4. API and Supabase persistence: validated schema, access controls, call/session APIs, and migration of the 100-transcript analysis into a reproducible dataset artifact.
5. Integration, evaluation, deployment, and latency/reliability checks.

## Step 1 scope

This step intentionally does not claim that microphone capture is transcription, that demo call records are persisted, or that the AI provider is connected. Those are separate milestones and will be tested before they are described as working.

## Verification checklist

- [x] Work is isolated on `feat/step-1-frontend-foundation`.
- [x] Dark/light theme toggle is available and preference is persisted when browser storage is available.
- [x] Status text identifies the app as demo/offline-safe rather than falsely reporting all systems operational.
- [ ] Run a clean dependency install and production build in a Node environment.
- [ ] Manually check dark and light themes at desktop and mobile widths.
