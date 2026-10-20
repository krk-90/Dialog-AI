from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_does_not_require_provider_key():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_token_endpoint_falls_back_when_key_missing(monkeypatch):
    monkeypatch.delenv("DEEPGRAM_API_KEY", raising=False)
    response = client.post("/api/transcription/deepgram-token", json={"ttl_seconds": 60})
    assert response.status_code == 503
    assert "manual transcript mode" in response.json()["detail"]


def test_token_ttl_is_validated():
    response = client.post("/api/transcription/deepgram-token", json={"ttl_seconds": 5})
    assert response.status_code == 422
