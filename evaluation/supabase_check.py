"""Diagnose Supabase REST/Auth connectivity using local environment variables.

Run from the repository root with: python evaluation/supabase_check.py
Only HTTP status and sanitized provider message/hint fields are printed; API keys are never logged.
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - requirements.txt includes python-dotenv
    load_dotenv = None


def _safe_text(value: object, secrets: tuple[str, ...], limit: int = 240) -> str:
    """Bound and redact server-provided diagnostic text before printing it."""
    if not isinstance(value, str):
        return ""
    text = value.replace("\r", " ").replace("\n", " ")
    for secret in secrets:
        if secret:
            text = text.replace(secret, "[REDACTED]")
    text = re.sub(r"(?i)(sb_(?:publishable|secret)_[A-Za-z0-9_-]+)", "[REDACTED_KEY]", text)
    text = re.sub(r"(?i)(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)", "[REDACTED_TOKEN]", text)
    return text[:limit]


def _request(url: str, key: str, timeout: int = 12) -> tuple[int, bytes]:
    headers = {
        "apikey": key,
        "Accept": "application/json",
        "User-Agent": "Dialog-AI-supabase-check/1.0",
    }
    if key.startswith("eyJ"):
        # Legacy anon JWTs are accepted in both headers by Supabase clients.
        # Do not send sb_publishable_* values as Bearer tokens.
        headers["Authorization"] = f"Bearer {key}"
    if "/rest/v1/" in url:
        headers["Accept-Profile"] = "public"
    request = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read(16_384)
    except urllib.error.HTTPError as error:
        return error.code, error.read(16_384)


def _check(label: str, url: str, key: str, secrets: tuple[str, ...]) -> bool:
    try:
        status, body = _request(url, key)
    except Exception as error:
        print(f"FAIL {label}: connection error ({type(error).__name__})")
        return False

    if 200 <= status < 300:
        print(f"PASS {label}: HTTP {status}")
        return True

    print(f"FAIL {label}: HTTP {status}")
    try:
        payload = json.loads(body)
    except (ValueError, TypeError):
        payload = {}

    if isinstance(payload, dict):
        for field in ("message", "hint", "error_description", "error"):
            value = _safe_text(payload.get(field), secrets)
            if value:
                print(f"  {field}: {value}")
    else:
        print("  Response was not a JSON object; body omitted for safety.")
    print("  Check that the URL and publishable/anon key belong to the same project.")
    return False


def main() -> int:
    if load_dotenv:
        load_dotenv()

    raw_url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_ANON_KEY", "").strip()
    if not raw_url or not key:
        print("FAIL Supabase configuration: set SUPABASE_URL and SUPABASE_ANON_KEY in .env or the shell.")
        return 2

    parsed = urllib.parse.urlparse(raw_url)
    if parsed.scheme != "https" or not parsed.hostname or not parsed.hostname.endswith(".supabase.co"):
        print("FAIL SUPABASE_URL: expected https://<project-ref>.supabase.co")
        return 2
    if parsed.path not in ("", "/") or parsed.query or parsed.fragment:
        print("FAIL SUPABASE_URL: use the project root URL, without a path, query, or fragment.")
        return 2
    if not (key.startswith("sb_publishable_") or key.startswith("eyJ")):
        print("WARN SUPABASE_ANON_KEY format is not a publishable key or legacy JWT anon key.")

    base = raw_url.rstrip("/")
    project_ref = parsed.hostname.split(".", 1)[0]
    print(f"Supabase project host: {parsed.hostname}")
    print(f"Key format: {'publishable' if key.startswith('sb_publishable_') else 'legacy JWT-like' if key.startswith('eyJ') else 'unknown'}")
    secrets = (key, raw_url)
    checks = [
        _check("REST API calls-table query", base + "/rest/v1/calls?select=id&limit=0", key, secrets),
        _check("Auth service", base + "/auth/v1/health", key, secrets),
    ]
    print(f"Supabase connectivity: {sum(checks)}/{len(checks)} checks passed (project ref: {project_ref}).")
    return 0 if all(checks) else 1


if __name__ == "__main__":
    raise SystemExit(main())
