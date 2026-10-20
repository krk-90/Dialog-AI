"""Minimal live-provider smoke checks for CI. Never prints credentials or response bodies."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request


def _safe_error_hint(body: bytes) -> str:
    """Return only allow-listed error metadata, never raw provider response text."""
    try:
        parsed = json.loads(body)
    except (ValueError, TypeError):
        return ""
    error = parsed.get("error", parsed)
    if not isinstance(error, dict):
        return ""
    parts = []
    for field in ("code", "type"):
        value = error.get(field)
        if isinstance(value, str) and value and len(value) <= 100:
            parts.append(f"{field}={value}")
    return f" ({', '.join(parts)})" if parts else ""


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
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            code = response.status
            body = response.read()
    except urllib.error.HTTPError as error:
        code, body = error.code, error.read()
    except Exception as error:
        print(f"FAIL {name}: connection error ({type(error).__name__})")
        return False

    ok = 200 <= code < 300
    if ok and validate_json_field:
        try:
            parsed = json.loads(body)
            ok = bool(parsed.get(validate_json_field))
        except (ValueError, AttributeError):
            ok = False

    status = "PASS" if ok else "FAIL"
    hint = "" if ok else _safe_error_hint(body)
    print(f"{status} {name}: HTTP {code}{hint}")
    return ok


def main() -> int:
    groq = os.getenv("GROQ_API_KEY", "")
    deepgram = os.getenv("DEEPGRAM_API_KEY", "")
    supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    supabase_key = os.getenv("SUPABASE_ANON_KEY", "")
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

    model = os.getenv("GROQ_MODEL", "").strip() or "llama-3.3-70b-versatile"
    results = [
        call(
            "Groq chat completion",
            "https://api.groq.com/openai/v1/chat/completions",
            method="POST",
            headers={"Authorization": f"Bearer {groq}", "Content-Type": "application/json"},
            payload={
                "model": model,
                "messages": [{"role": "user", "content": "Reply with the single word OK."}],
                "max_tokens": 8,
                "temperature": 0,
            },
            validate_json_field="choices",
        ),
        # Listing projects validates a Deepgram API key without creating a key or
        # requiring key-management permissions/project IDs.
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