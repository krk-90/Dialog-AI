import httpx
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_coaching_uses_fallback_without_groq_key(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    response = client.post(
        "/api/coaching/suggestion",
        json={
            "stage": "Discovery",
            "purpose": "Understand current process",
            "response_type": "Other",
            "transcript": ["We currently use spreadsheets."],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "fallback"
    assert "open question" in body["suggestion"]


def test_coaching_rejects_unknown_stage():
    response = client.post(
        "/api/coaching/suggestion",
        json={"stage": "Secret stage", "purpose": "Test"},
    )
    assert response.status_code == 422


def test_coaching_limits_transcript_context():
    response = client.post(
        "/api/coaching/suggestion",
        json={
            "stage": "Discovery",
            "purpose": "Understand current process",
            "transcript": [f"line {i}" for i in range(9)],
        },
    )
    assert response.status_code == 422


def test_coaching_uses_groq_when_configured(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    monkeypatch.setenv("GROQ_MODEL", "test-model")

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{"message": {"content": "Ask one focused discovery question."}}]}

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, headers, json):
            assert url == "https://api.groq.com/openai/v1/chat/completions"
            assert headers["Authorization"] == "Bearer test-key"
            assert json["model"] == "test-model"
            return FakeResponse()

    monkeypatch.setattr("app.routes.coaching.httpx.AsyncClient", lambda **kwargs: FakeClient())
    response = client.post(
        "/api/coaching/suggestion",
        json={
            "stage": "Discovery",
            "purpose": "Understand current process",
            "response_type": "Other",
            "transcript": ["We currently use spreadsheets."],
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "suggestion": "Ask one focused discovery question.",
        "source": "groq",
    }


def test_coaching_falls_back_if_groq_fails(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test-key")

    class BrokenClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, *args, **kwargs):
            raise httpx.ConnectError("provider unavailable")

    monkeypatch.setattr("app.routes.coaching.httpx.AsyncClient", lambda **kwargs: BrokenClient())
    response = client.post(
        "/api/coaching/suggestion",
        json={
            "stage": "Discovery",
            "purpose": "Understand current process",
            "response_type": "Other",
        },
    )

    assert response.status_code == 200
    assert response.json()["source"] == "fallback"
