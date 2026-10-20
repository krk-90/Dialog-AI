"""Minimal live-provider smoke checks for CI. Never prints credentials or response bodies."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request


def _safe_error_hint(body: bytes, headers=None) -> str:
    """Expose sanitized error categories and safe response metadata, never body text."""
    try:
        parsed = json.loads(body)
    except (ValueError, TypeError):
        details = ["non_json_error_response"]
        if headers is not None:
            content_type = headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
            if content_type and len(content_type) <= 80 and all(c.isalnum() or c in "/.+-_" for c in content_type):
                details.append(f"content_type={content_type}")
            for header in ("x-request-id", "request-id", "cf-ray"):
                value = headers.get(header, "")
                if value and len(value) <= 100 and all(c.isalnum() or c in "-_." for c in value):
                    details.append(f"{header.replace(chr(45), chr(95))}={value}")
        return " (" + ", ".join(details) + ")"

    # Providers use different envelopes, so inspect a bounded set of nested objects.
    candidates = [parsed]
    for key in ("error", "errors", "message"):
        value = parsed.get(key) if isinstance(parsed, dict) else None
        if isinstance(value, dict):
            candidates.append(value)
        elif isinstance(value, list):
            candidates.extend(item for item in value[:3] if isinstance(item, dict))

    metadata = []
    messages = []
    for item in candidates:
        for field in ("code", "type"):
            value = item.get(field)
            if isinstance(value, str) and value and len(value) <= 80:
                # Only allow simple identifier characters; avoid echoing arbitrary text.
                if all(char.isalnum() or char in "._-" for char in value):
                    metadata.append(f"{field}={value}")
        value = item.get("message")
        if isinstance(value, str):
            messages.append(value.lower()[:500])

    combined = " ".join(messages)
    if any(term in combined for term in ("invalid api key", "invalid_api_key", "api key is invalid", "authentication failed")):
        category = "invalid_or_rejected_api_key"
    elif any(term in combined for term in ("model not found", "model is not available", "model access", "not authorized to use model", "permission to access model")):
        category = "model_unavailable_or_not_permitted"
    elif any(term in combined for term in ("jwt", "invalid token", "signature verification", "token has expired")):
        category = "invalid_or_expired_token"
    elif any(term in combined for term in ("project ref", "project not found", "does not match project", "different project")):
        category = "project_url_key_mismatch"
    elif any(term in combined for term in ("forbidden", "not allowed", "permission denied")):
        category = "request_forbidden_check_key_and_permissions"
    elif any(term in combined for term in ("unauthorized", "missing api key", "missing authorization")):
        category = "authorization_missing_or_rejected"
    else:
        category = "unclassified_provider_error"

    details = [f"diagnosis={category}"]
    details.extend(dict.fromkeys(metadata))
    return " (" + ", ".join(details) + ")"


def call(
    name: str,
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    payload: dict | None = None,
    validate_json_field: str | None = None,
) -> bool:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    body = b""
    response_headers = None
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            code = response.status
            body = response.read()
            response_headers = response.headers
    except urllib.error.HTTPError as error:
        code, body = error.code, error.read()
        response_headers = error.headers
    except Exception as error:
        print(f"FAIL {name}: connection error ({type(error).__name__})")
        return False

    ok = 200 <= code < 300
    if ok and validate_json_field:
        try:
            parsed = json.loads(body)
            ok = isinstance(parsed, dict) and bool(parsed.get(validate_json_field))
        except (ValueError, AttributeError):
            ok = False

    status = "PASS" if ok else "FAIL"
    hint = "" if ok else _safe_error_hint(body, response_headers)
    print(f"{status} {name}: HTTP {code}{hint}")
    return ok


def main() -> int:
    groq = os.getenv("GROQ_API_KEY", "").strip()
    deepgram = os.getenv("DEEPGRAM_API_KEY", "").strip()
    supabase_url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    supabase_key = os.getenv("SUPABASE_ANON_KEY", "").strip()
    missing = [
        name for name, value in [
            ("GROQ_API_KEY", groq),
            ("DEEPGRAM_API_KEY", deepgram),
            ("SUPABASE_URL", supabase_url),
            ("SUPABASE_ANON_KEY", supabase_key),
        ] if not value
    ]
    if missing:
        print("FAIL provider smoke: missing GitHub Actions secret(s): " + ", ".join(missing))
        return 1

    # Print formats only, never key values. This catches accidentally storing a
    # dashboard URL, service-role key in the wrong field, or malformed URL.
    print(f"Config check: GROQ_API_KEY present ({len(groq)} chars); model-specific setting not required")
    print(f"Config check: SUPABASE_URL format={'https' if supabase_url.startswith('https://') else 'unexpected'}; SUPABASE_ANON_KEY format={'publishable' if supabase_key.startswith('sb_publishable_') else 'JWT-like' if supabase_key.startswith('eyJ') else 'unknown'}")

    results = [
        call(
            "Groq API authentication",
            "https://api.groq.com/openai/v1/models",
            headers={"Authorization": f"Bearer {groq}"},
            validate_json_field="data",
        ),
        call(
            "Deepgram API key",
            "https://api.deepgram.com/v1/projects",
            headers={"Authorization": f"Token {deepgram}", "Content-Type": "application/json"},
            validate_json_field="projects",
        ),
        call(
            "Supabase REST API",
            supabase_url + "/rest/v1/",
            headers={"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}"},
        ),
    ]
    print(f"Provider smoke summary: {sum(results)}/{len(results)} providers passed.")
    return 0 if all(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
