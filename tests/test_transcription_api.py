from fastapi.testclient import TestClient

from app.main import app
import app.routes.transcription as transcription

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


def test_token_endpoint_uses_deepgram_auth_grant(monkeypatch):
    monkeypatch.setenv("DEEPGRAM_API_KEY", "test-secret")

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {"access_token": "temporary-token", "expires_in": 60}

    class FakeClient:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, **kwargs):
            assert url == "https://api.deepgram.com/v1/auth/grant"
            assert kwargs["headers"]["Authorization"] == "Token test-secret"
            assert kwargs["json"] == {"ttl_seconds": 60}
            return FakeResponse()

    monkeypatch.setattr(transcription.httpx, "AsyncClient", FakeClient)
    response = client.post("/api/transcription/deepgram-token", json={"ttl_seconds": 60})
    assert response.status_code == 200
    assert response.json() == {"access_token": "temporary-token", "expires_in": 60}
