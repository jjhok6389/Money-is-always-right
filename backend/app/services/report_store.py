"""
Firestore / demo store for coaching reports.
"""

from __future__ import annotations

from typing import Any

from app.services import firebase_service

_COLLECTION = "coachingReports"
_demo_reports: dict[str, dict[str, Any]] = {}


def save_report(doc: dict[str, Any]) -> dict[str, Any]:
    report_id = doc["reportId"]
    firebase_service.init_firebase()
    if firebase_service.is_demo_mode():
        _demo_reports[report_id] = dict(doc)
        return dict(doc)

    from firebase_admin import firestore

    db = firestore.client()
    db.collection(_COLLECTION).document(report_id).set(doc, merge=True)
    return doc


def get_report(report_id: str, user_id: str) -> dict[str, Any] | None:
    firebase_service.init_firebase()
    if firebase_service.is_demo_mode():
        row = _demo_reports.get(report_id)
        if not row or row.get("userId") != user_id:
            return None
        return dict(row)

    from firebase_admin import firestore

    snap = firestore.client().collection(_COLLECTION).document(report_id).get()
    if not snap.exists:
        return None
    data = snap.to_dict() or {}
    if data.get("userId") != user_id:
        return None
    return data


def list_reports(user_id: str, limit: int = 20) -> list[dict[str, Any]]:
    firebase_service.init_firebase()
    if firebase_service.is_demo_mode():
        rows = [dict(v) for v in _demo_reports.values() if v.get("userId") == user_id]
        rows.sort(key=lambda r: r.get("createdAt") or "", reverse=True)
        return rows[:limit]

    from firebase_admin import firestore

    db = firestore.client()
    try:
        query = (
            db.collection(_COLLECTION)
            .where("userId", "==", user_id)
            .order_by("createdAt", direction=firestore.Query.DESCENDING)
            .limit(limit)
        )
        return [snap.to_dict() or {} for snap in query.stream()]
    except Exception:
        # Composite index may be missing in early envs — fall back to filter + sort.
        rows = [
            snap.to_dict() or {}
            for snap in db.collection(_COLLECTION).where("userId", "==", user_id).stream()
        ]
        rows.sort(key=lambda r: r.get("createdAt") or "", reverse=True)
        return rows[:limit]


def latest_report(user_id: str) -> dict[str, Any] | None:
    rows = list_reports(user_id, limit=1)
    return rows[0] if rows else None
