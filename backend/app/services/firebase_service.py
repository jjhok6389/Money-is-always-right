"""
Firebase Admin bootstrap + Firestore helpers.
Auth tokens from the React client are verified here before profile access.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import firebase_admin
from firebase_admin import auth, credentials, firestore

from app.config import get_settings

_demo_store: dict[str, dict[str, Any]] = {}
_initialized = False
_demo_mode = False


def _has_credentials(settings) -> bool:
    if settings.firebase_credentials_path and Path(settings.firebase_credentials_path).exists():
        return True
    env_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    return bool(env_path and Path(env_path).exists())


def init_firebase() -> None:
    global _initialized, _demo_mode

    if _initialized:
        return

    settings = get_settings()

    if not _has_credentials(settings):
        if not settings.allow_demo_mode:
            raise RuntimeError("Firebase credentials are required when ALLOW_DEMO_MODE=false")
        _demo_mode = True
        _initialized = True
        return

    try:
        if not firebase_admin._apps:
            if settings.firebase_credentials_path:
                cred = credentials.Certificate(settings.firebase_credentials_path)
                firebase_admin.initialize_app(
                    cred,
                    {"projectId": settings.firebase_project_id or None},
                )
            else:
                firebase_admin.initialize_app(
                    options={"projectId": settings.firebase_project_id or None},
                )
        _demo_mode = False
    except Exception:
        if not settings.allow_demo_mode:
            raise
        _demo_mode = True

    _initialized = True


def verify_id_token(id_token: str) -> dict[str, Any]:
    init_firebase()
    if _demo_mode:
        # Demo mode accepts any non-empty bearer token for local scaffolding.
        if not id_token:
            raise ValueError("Missing token")
        # Prefer decoding Firebase JWT payload without verification when possible
        # so UI uid stays consistent across Firestore client writes.
        try:
            import base64
            import json

            parts = id_token.split(".")
            if len(parts) >= 2:
                padded = parts[1] + "=" * (-len(parts[1]) % 4)
                payload = json.loads(base64.urlsafe_b64decode(padded.encode()))
                return {
                    "uid": payload.get("user_id") or payload.get("sub") or "demo-user",
                    "email": payload.get("email") or "demo@example.com",
                }
        except Exception:
            pass
        return {"uid": "demo-user", "email": "demo@example.com"}
    return auth.verify_id_token(id_token)


def get_user_document(uid: str) -> dict[str, Any] | None:
    init_firebase()
    if _demo_mode:
        return _demo_store.get(uid)

    db = firestore.client()
    snap = db.collection("users").document(uid).get()
    return snap.to_dict() if snap.exists else None


def upsert_user_document(uid: str, payload: dict[str, Any]) -> dict[str, Any]:
    init_firebase()
    if _demo_mode:
        current = _demo_store.get(uid, {})
        merged = {**current, **payload, "uid": uid}
        _demo_store[uid] = merged
        return merged

    db = firestore.client()
    ref = db.collection("users").document(uid)
    ref.set(payload, merge=True)
    snap = ref.get()
    data = snap.to_dict() or {}
    data["uid"] = uid
    return data


def is_demo_mode() -> bool:
    init_firebase()
    return _demo_mode
