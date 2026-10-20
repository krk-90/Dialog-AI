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
