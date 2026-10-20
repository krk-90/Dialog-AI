"""Minimal live-provider smoke checks for CI. Never prints credentials or response bodies."""
from __future__ import annotations

import base64
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request


def _safe_error_hint(body: bytes, headers=None, status_code: int | None = None) -> str:
    """Expose sanitized error categories and safe response metadata, never body text."""
    try:
        parsed = json.loads(body)
    except (ValueError, TypeError):
        details = ["non_json_error_response", f"body_bytes={len(body)}"]
        if status_code is not None:
            details.append(f"http_status={status_code}")
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
    for key in ("error", "errors", "message", "msg", "error_description", "details"):
        value = parsed.get(key) if isinstance(parsed, dict) else None
        if isinstance(value, dict):
            candidates.append(value)
        elif isinstance(value, list):
            candidates.extend(item for item in value[:3] if isinstance(item, dict))
        elif isinstance(value, str):
            # Classify string-valued error fields without printing their contents.
            candidates.append({"message": value})

    metadata = []
    messages = []
    for item in candidates:
        for field in ("code", "type", "statusCode", "status_code"):
            value = item.get(field)
            if isinstance(value, (str, int)) and str(value) and len(str(value)) <= 80:
                # Only allow simple identifier characters; avoid echoing arbitrary text.
                value = str(value)
                if all(char.isalnum() or char in "._-" for char in value):
                    metadata.append(f"{field}={value}")
        for field in ("message", "msg", "error_description", "details", "hint", "error"):
            value = item.get(field)
            if isinstance(value, str):
                messages.append(value.lower()[:500])

    combined = " ".join(messages)
    if any(term in combined for term in ("invalid api key", "invalid_api_key", "api key is invalid", "authentication failed", "no api key found", "invalid key")):
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

    if category == "unclassified_provider_error" and status_code == 401:
        category = "http_401_authentication_rejected"

    details = [f"diagnosis={category}", f"body_bytes={len(body)}"]
    if status_code is not None:
        details.append(f"http_status={status_code}")
    # Emit only allowlisted boolean signals, never the provider's raw error text.
    signals = []
    signal_terms = {
        "api_key": ("api key", "apikey", "api_key"),
        "invalid": ("invalid", "rejected", "malformed"),
        "missing": ("missing", "not provided", "not found"),
        "project": ("project", "ref mismatch"),
        "publishable": ("publishable", "sb_publishable"),
        "jwt": ("jwt", "token", "signature"),
        "authorization": ("authorization", "unauthorized", "bearer"),
        "permission": ("permission", "forbidden", "not allowed"),
    }
    for signal, terms in signal_terms.items():
        if any(term in combined for term in terms):
            signals.append(signal)
    if signals:
        details.append("error_signals=" + ",".join(signals))
    if isinstance(parsed, dict):
        safe_keys = [
            key for key in parsed.keys()
            if isinstance(key, str) and key and len(key) <= 40
            and all(char.isalnum() or char in "._-" for char in key)
        ]
        if safe_keys:
            details.append("json_keys=" + ",".join(sorted(set(safe_keys))[:8]))
    if headers is not None:
        content_type = headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
        if content_type and len(content_type) <= 80 and all(c.isalnum() or c in "/.+-_" for c in content_type):
            details.append(f"content_type={content_type}")
        for header in ("x-request-id", "request-id", "cf-ray"):
            value = headers.get(header, "")
            if value and len(value) <= 100 and all(c.isalnum() or c in "-_." for c in value):
                details.append(f"{header.replace(chr(45), chr(95))}={value}")
    details.extend(dict.fromkeys(metadata))
    return " (" + ", ".join(dict.fromkeys(details)) + ")"


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
    request_headers = {"User-Agent": "Dialog-AI-provider-smoke/1.0", "Accept": "application/json"}
    request_headers.update(headers or {})
    request = urllib.request.Request(url, data=data, headers=request_headers, method=method)
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
    hint = "" if ok else _safe_error_hint(body, response_headers, code)
    print(f"{status} {name}: HTTP {code}{hint}")
    return ok


def _supabase_key_hint(url: str, key: str) -> str:
    """Compare non-secret JWT claims with the configured Supabase project URL."""
    try:
        host = urllib.parse.urlparse(url).hostname or ""
        project_ref = host.split(".", 1)[0] if host.endswith(".supabase.co") else ""
        parts = key.split(".")
        if len(parts) != 3:
            return "key_format=not_legacy_jwt"
        payload = parts[1] + "=" * (-len(parts[1]) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload.encode("ascii")))
        token_ref = claims.get("ref")
        expires = claims.get("exp")
        role = claims.get("role")
        details = []
        if project_ref and isinstance(token_ref, str):
            details.append("project_ref_match=" + str(project_ref == token_ref).lower())
        if isinstance(role, str) and role in ("anon", "authenticated", "service_role"):
            details.append("jwt_role=" + role)
        if isinstance(expires, (int, float)):
            details.append("jwt_expired=" + str(expires <= time.time()).lower())
        return ", ".join(details) if details else "claims_unavailable"
    except (ValueError, TypeError, UnicodeError, json.JSONDecodeError):
        return "claims_unavailable"

def _supabase_rest_headers(key: str) -> dict[str, str]:
    """Build Supabase REST headers for publishable and legacy JWT anon keys."""
    headers = {"apikey": key, "Accept-Profile": "public"}
    # Legacy anon keys are JWTs and are commonly sent in both headers.
    # sb_publishable_* keys are not JWTs; never put those in Authorization.
    if key.startswith("eyJ"):
        headers["Authorization"] = f"Bearer {key}"
    return headers


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
    if supabase_key.startswith("eyJ"):
        print("Supabase key claims: " + _supabase_key_hint(supabase_url, supabase_key))

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
            supabase_url + "/rest/v1/calls?select=id&limit=0",
            # Probe a real table rather than only the OpenAPI root. This confirms
            # the key can reach the configured public schema and table.
            headers=_supabase_rest_headers(supabase_key),
        ),
    ]
    print(f"Provider smoke summary: {sum(results)}/{len(results)} providers passed.")
    return 0 if all(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
