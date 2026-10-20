"""Minimal live-provider smoke checks for CI. Never prints credentials or response bodies."""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request


def call(name: str, url: str, *, method: str = "GET", headers: dict[str, str] | None = None, payload: dict | None = None) -> bool:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
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
    if ok and name == "Groq chat completion":
        try:
            parsed = json.loads(body)
            ok = bool(parsed.get("choices", [{}])[0].get("message", {}).get("content", "").strip())
        except (ValueError, IndexError, AttributeError):
            ok = False
    if ok and name == "Deepgram temporary key":
        try:
            ok = bool(json.loads(body).get("key"))
        except (ValueError, AttributeError):
            ok = False
    print(f'{"PASS" if ok else "FAIL"} {name}: HTTP {code}')
    return ok


def main() -> int:
    groq = os.getenv("GROQ_API_KEY", "")
    deepgram = os.getenv("DEEPGRAM_API_KEY", "")
    supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    supabase_key = os.getenv("SUPABASE_ANON_KEY", "")
    missing = [name for name, value in [
        ("GROQ_API_KEY", groq),
        ("DEEPGRAM_API_KEY", deepgram),
        ("SUPABASE_URL", supabase_url),
        ("SUPABASE_ANON_KEY", supabase_key),
    ] if not value]
    if missing:
        print("FAIL provider smoke: missing GitHub Actions secret(s): " + ", ".join(missing))
        return 1

    results = [
        call(
            "Groq chat completion",
            "https://api.groq.com/openai/v1/chat/completions",
            method="POST",
            headers={"Authorization": f"Bearer {groq}", "Content-Type": "application/json"},
            payload={
                "model": os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
                "messages": [{"role": "user", "content": "Reply with the single word OK."}],
                "max_tokens": 8,
                "temperature": 0,
            },
        ),
        call(
            "Deepgram temporary key",
            "https://api.deepgram.com/v1/keys",
            method="POST",
            headers={"Authorization": f"Token {deepgram}", "Content-Type": "application/json"},
            payload={
                "comment": "Dialog AI CI smoke test",
                "scopes": ["usage:write"],
                "tags": ["dialog-ai", "ci-smoke"],
                "time_to_live_in_seconds": 60,
            },
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
