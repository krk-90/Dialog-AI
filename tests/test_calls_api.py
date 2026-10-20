from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_local_history_starts_empty_and_does_not_require_login(monkeypatch, tmp_path):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_ANON_KEY", raising=False)
    monkeypatch.setenv("DIALOG_AI_LOCAL_HISTORY", "true")
    monkeypatch.setenv("DIALOG_AI_DB_PATH", str(tmp_path / "calls.sqlite3"))

    response = client.get("/api/calls")

    assert response.status_code == 200
    assert response.json() == []


def test_local_call_is_persisted_with_transcript(monkeypatch, tmp_path):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_ANON_KEY", raising=False)
    monkeypatch.setenv("DIALOG_AI_LOCAL_HISTORY", "true")
    monkeypatch.setenv("DIALOG_AI_DB_PATH", str(tmp_path / "calls.sqlite3"))
    payload = {
        "prospect": "Jordan Lee",
        "company": "Meridian Software",
        "outcome": "Follow-up",
        "stage": 4,
        "duration": "02:15",
        "transcript": [{"speaker": "Prospect", "text": "We use spreadsheets."}],
    }

    created = client.post("/api/calls", json=payload)
    listed = client.get("/api/calls")

    assert created.status_code == 201
    assert created.json()["id"]
    assert created.json()["transcript"] == payload["transcript"]
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["prospect"] == "Jordan Lee"
    assert listed.json()[0]["transcript"] == payload["transcript"]


def test_cloud_history_requires_sign_in_when_supabase_is_configured(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "public-test-key")
    response = client.get("/api/calls")
    assert response.status_code == 401


def test_local_history_does_not_require_supabase_configuration(monkeypatch, tmp_path):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_ANON_KEY", raising=False)
    monkeypatch.setenv("DIALOG_AI_LOCAL_HISTORY", "true")
    monkeypatch.setenv("DIALOG_AI_DB_PATH", str(tmp_path / "calls.sqlite3"))
    response = client.get("/api/calls")
    assert response.status_code == 200
    assert response.json() == []


def test_local_history_can_be_disabled_on_public_deployments(monkeypatch, tmp_path):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_ANON_KEY", raising=False)
    monkeypatch.setenv("DIALOG_AI_LOCAL_HISTORY", "false")
    monkeypatch.setenv("DIALOG_AI_DB_PATH", str(tmp_path / "calls.sqlite3"))

    assert client.get("/api/calls").status_code == 503
    assert client.post("/api/calls", json={"prospect": "Test"}).status_code == 503
