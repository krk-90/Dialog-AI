# Dialog-AI
An AI-powered cold-call companion that guides sales representatives through structured conversations, surfaces likely prospect responses, captures objections and customer needs, and tracks call outcomes and next steps. Built with React, TypeScript, FastAPI, Supabase, and LLM-powered assistance.
coldcall-copilot/
│
├── frontend/                         # React + Vite
│   ├── public/
│   │   ├── favicon.svg
│   │   └── logo.svg
│   │
│   ├── src/
│   │   ├── app/
│   │   │   ├── App.jsx
│   │   │   ├── routes.jsx
│   │   │   └── providers.jsx
│   │   │
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── AppLayout.jsx
│   │   │   │   ├── Header.jsx
│   │   │   │   └── Sidebar.jsx
│   │   │   ├── call/
│   │   │   │   ├── StageProgress.jsx
│   │   │   │   ├── StageGuidance.jsx
│   │   │   │   ├── ResponseOptions.jsx
│   │   │   │   ├── ProspectNotes.jsx
│   │   │   │   └── CallControls.jsx
│   │   │   ├── history/
│   │   │   │   ├── CallHistoryTable.jsx
│   │   │   │   └── CallDetails.jsx
│   │   │   └── common/
│   │   │       ├── LoadingState.jsx
│   │   │       └── ErrorState.jsx
│   │   │
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── LiveCall.jsx
│   │   │   ├── CallHistory.jsx
│   │   │   └── NotFound.jsx
│   │   │
│   │   ├── services/
│   │   │   ├── api.js
│   │   │   ├── calls.js
│   │   │   └── suggestions.js
│   │   │
│   │   ├── hooks/
│   │   │   ├── useCallSession.js
│   │   │   └── useAISuggestion.js
│   │   │
│   │   ├── data/
│   │   │   └── fallbackGuidance.js
│   │   │
│   │   ├── utils/
│   │   │   ├── formatDate.js
│   │   │   └── errorMessages.js
│   │   │
│   │   ├── styles/
│   │   │   └── globals.css
│   │   │
│   │   └── main.jsx
│   │
│   ├── .env.example
│   ├── package.json
│   ├── vite.config.js
│   └── README.md
│
├── backend/                          # FastAPI
│   ├── app/
│   │   ├── main.py                   # FastAPI application
│   │   ├── config.py                 # Environment settings
│   │   ├── dependencies.py
│   │   │
│   │   ├── api/
│   │   │   ├── health.py
│   │   │   ├── calls.py
│   │   │   ├── stages.py
│   │   │   └── suggestions.py
│   │   │
│   │   ├── schemas/
│   │   │   ├── call.py
│   │   │   ├── stage.py
│   │   │   └── suggestion.py
│   │   │
│   │   ├── services/
│   │   │   ├── call_service.py
│   │   │   ├── stage_service.py
│   │   │   └── history_service.py
│   │   │
│   │   ├── ai/
│   │   │   ├── llm_client.py
│   │   │   ├── suggestion_service.py
│   │   │   ├── summary_service.py
│   │   │   └── prompts.py
│   │   │
│   │   ├── repositories/
│   │   │   ├── call_repository.py
│   │   │   └── stage_repository.py
│   │   │
│   │   ├── core/
│   │   │   ├── exceptions.py
│   │   │   └── logging.py
│   │   │
│   │   └── data/
│   │       ├── call_stages.json
│   │       └── fallback_guidance.json
│   │
│   ├── tests/
│   │   ├── test_health.py
│   │   ├── test_calls.py
│   │   ├── test_stages.py
│   │   └── test_ai_fallback.py
│   │
│   ├── .env.example
│   ├── requirements.txt
│   └── README.md
│
├── supabase/
│   ├── migrations/
│   │   └── 001_initial_schema.sql
│   └── seed.sql
│
├── evaluation/
│   ├── test_cases.json
│   └── evaluate_suggestions.py
│
├── docs/
│   ├── architecture.md
│   ├── api.md
│   └── design-decisions.md
│
├── .github/
│   └── workflows/
│       └── backend-tests.yml
│
├── .gitignore
├── .env.example
├── render.yaml
├── docker-compose.yml
├── package.json
└── README.md