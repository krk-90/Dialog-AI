from __future__ import annotations

import json

from evaluation.supabase_check import _safe_text


def test_safe_text_redacts_supplied_secrets_and_publishable_keys() -> None:
    text = _safe_text(
        "Rejected sb_publishable_abcdef and local-secret",
        ("local-secret",),
    )
    assert "local-secret" not in text
    assert "sb_publishable_abcdef" not in text
    assert "[REDACTED]" in text


def test_safe_text_bounds_provider_message() -> None:
    assert len(_safe_text("x" * 500, ())) == 240
