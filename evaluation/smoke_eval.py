"""Deployment smoke evaluation for Dialog AI.

Usage:
  python evaluation/smoke_eval.py --base-url http://127.0.0.1:8000
  python evaluation/smoke_eval.py --base-url https://your-api.onrender.com --output evaluation-report.json
"""
from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def request_json(base_url: str, path: str, payload: dict[str, Any] | None = None) -> tuple[int, dict[str, Any], float]:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"} if data is not None else {}
    request = urllib.request.Request(base_url.rstrip("/") + path, data=data, headers=headers, method="GET" if data is None else "POST")
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            status = response.status
            body = response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        status = error.code
        body = error.read().decode("utf-8")
    elapsed_ms = (time.perf_counter() - started) * 1000
    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        parsed = {"raw": body[:300]}
    return status, parsed if isinstance(parsed, dict) else {"data": parsed}, round(elapsed_ms, 2)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True, help="Base URL for the Dialog AI API")
    parser.add_argument("--output", help="Optional path for a JSON report")
    args = parser.parse_args()

    checks: list[dict[str, Any]] = []

    def record(name: str, path: str, expected: str, call: Any) -> None:
        try:
            status, body, latency = call()
            passed = expected == "health" and status == 200 and body.get("status") == "ok"
            if expected == "coaching":
                passed = status == 200 and isinstance(body.get("suggestion"), str) and bool(body["suggestion"].strip()) and body.get("source") in {"groq", "fallback"}
            elif expected == "validation":
                passed = status == 422
            checks.append({"name": name, "path": path, "passed": passed, "status_code": status, "latency_ms": latency, "detail": body if not passed else None})
        except Exception as error:  # report connectivity failures instead of hiding them
            checks.append({"name": name, "path": path, "passed": False, "error": type(error).__name__ + ": " + str(error)[:200]})

    record("health", "/health", "health", lambda: request_json(args.base_url, "/health"))
    record(
        "coaching_fallback_or_provider",
        "/api/coaching/suggestion",
        "coaching",
        lambda: request_json(args.base_url, "/api/coaching/suggestion", {
            "stage": "Discovery",
            "purpose": "Understand the prospect's current process",
            "response_type": "Other",
            "notes": "",
            "transcript": ["Prospect: We use spreadsheets today."],
        }),
    )
    record(
        "unknown_stage_rejected",
        "/api/coaching/suggestion",
        "validation",
        lambda: request_json(args.base_url, "/api/coaching/suggestion", {
            "stage": "not-a-valid-stage",
            "purpose": "Evaluation validation case",
        }),
    )

    passed = sum(1 for item in checks if item.get("passed"))
    latencies = sorted(item["latency_ms"] for item in checks if isinstance(item.get("latency_ms"), (int, float)))
    report = {
        "service": "dialog-ai-api",
        "base_url": args.base_url.rstrip("/"),
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "total": len(checks),
            "passed": passed,
            "failed": len(checks) - passed,
            "pass_rate": round(passed / len(checks), 4) if checks else 0,
            "p50_latency_ms": latencies[(len(latencies) - 1) // 2] if latencies else None,
        },
        "checks": checks,
    }
    rendered = json.dumps(report, indent=2)
    print(rendered)
    if args.output:
        Path(args.output).write_text(rendered + "\n", encoding="utf-8")
    return 0 if passed == len(checks) else 1


if __name__ == "__main__":
    raise SystemExit(main())
