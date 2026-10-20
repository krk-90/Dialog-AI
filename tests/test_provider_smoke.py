from __future__ import annotations

import json

from evaluation.provider_smoke import _safe_error_hint, _supabase_key_hint


def test_supabase_401_without_json_message_is_classified_and_sanitized() -> None:
    hint = _safe_error_hint(
        b'{"some_safe_field":"do not print any response content"}',
        {"Content-Type": "application/json", "x-request-id": "req_123"},
        401,
    )

    assert "diagnosis=http_401_authentication_rejected" in hint
    assert "http_status=401" in hint
    assert "body_bytes=" in hint
    assert "json_keys=some_safe_field" in hint
    assert "x_request_id=req_123" in hint
    assert "do not print any response content" not in hint


def test_invalid_api_key_error_is_classified_without_echoing_body() -> None:
    secret_text = "Invalid API key: never echo this provider response"
    hint = _safe_error_hint(
        ('{"message":' + json.dumps(secret_text) + "}").encode(),
        {"Content-Type": "application/json"},
        401,
    )

    assert "diagnosis=invalid_or_rejected_api_key" in hint
    assert secret_text not in hint


def test_non_json_error_reports_only_safe_metadata() -> None:
    hint = _safe_error_hint(
        b"private upstream response text",
        {"Content-Type": "text/plain", "cf-ray": "abc123"},
        502,
    )

    assert "non_json_error_response" in hint
    assert "http_status=502" in hint
    assert "content_type=text/plain" in hint
    assert "cf_ray=abc123" in hint
    assert "private upstream response text" not in hint


def test_publishable_key_hint_never_decodes_or_echoes_key() -> None:
    key = "sb_publishable_example-value"
    hint = _supabase_key_hint("https://example.supabase.co", key)

    assert hint == "key_format=not_legacy_jwt"
    assert key not in hint


def test_auth_error_emits_only_allowlisted_error_signals() -> None:
    body = b'{"message":"A publishable key was not accepted for this project"}'
    hint = _safe_error_hint(body, {"Content-Type": "application/json"}, 401)

    assert "diagnosis=http_401_authentication_rejected" in hint
    assert "error_signals=project,publishable" in hint
    assert "was not accepted" not in hint
