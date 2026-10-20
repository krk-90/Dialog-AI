from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_cloud_history_requires_sign_in():
    response = client.get("/api/calls")
    assert response.status_code == 401


def test_cloud_history_requires_supabase_configuration(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_ANON_KEY", raising=False)
    response = client.get("/api/calls", headers={"Authorization": "Bearer test-token"})
    assert response.status_code == 503
    assert "Local browser history" in response.json()["detail"]
