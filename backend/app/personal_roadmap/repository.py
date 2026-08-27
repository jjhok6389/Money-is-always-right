"""Firestore repository with an in-memory Demo implementation."""

from __future__ import annotations

from threading import Lock
from typing import Any

from app.personal_roadmap.models import PersonalRoadmap
from app.services import firebase_service

COLLECTION = "personalRoadmaps"
_demo_rows: dict[str, dict[str, Any]] = {}
_demo_lock = Lock()
_FINAL_STATUSES = {"COMPLETED", "PARTIAL", "SKIPPED"}


def _action_identity(month: dict[str, Any]) -> tuple[str, str, str]:
    action = month.get("primaryAction") or {}
    return (
        str(month.get("month") or ""),
        str(action.get("actionType") or ""),
        str(action.get("title") or ""),
    )


def _preserve_execution_statuses(
    previous: dict[str, Any] | None,
    current: dict[str, Any],
) -> dict[str, Any]:
    if not previous:
        return current
    statuses = {
        _action_identity(item): item.get("status")
        for item in previous.get("months") or []
        if item.get("status") in _FINAL_STATUSES
    }
    for item in current.get("months") or []:
        preserved = statuses.get(_action_identity(item))
        if preserved:
            item["status"] = preserved
    return current


class PersonalRoadmapRepository:
    def __init__(self, force_demo: bool | None = None):
        self.force_demo = force_demo

    def _is_demo(self) -> bool:
        if self.force_demo is not None:
            return self.force_demo
        firebase_service.init_firebase()
        return firebase_service.is_demo_mode()

    def save(self, roadmap: PersonalRoadmap) -> PersonalRoadmap:
        payload = roadmap.model_dump(mode="json")
        document_id = roadmap.roadmapId
        if self._is_demo():
            with _demo_lock:
                previous_rows = [
                    row
                    for row in _demo_rows.values()
                    if row.get("userId") == roadmap.userId
                ]
                previous_rows.sort(
                    key=lambda row: row.get("period", {}).get("start", ""),
                    reverse=True,
                )
                for previous in previous_rows:
                    payload = _preserve_execution_statuses(previous, payload)
                _demo_rows[document_id] = payload
            return PersonalRoadmap(**payload)

        from firebase_admin import firestore

        ref = firestore.client().collection(COLLECTION).document(document_id)
        previous_rows = [
            snapshot.to_dict() or {}
            for snapshot in firestore.client().collection(COLLECTION)
            .where("userId", "==", roadmap.userId).stream()
        ]
        previous_rows.sort(
            key=lambda row: row.get("period", {}).get("start", ""),
            reverse=True,
        )
        for previous in previous_rows:
            payload = _preserve_execution_statuses(previous, payload)
        ref.set(payload, merge=True)
        return PersonalRoadmap(**payload)

    def get(self, user_id: str, start_month: str) -> PersonalRoadmap | None:
        document_id = f"{user_id}_{start_month}"
        if self._is_demo():
            with _demo_lock:
                row = _demo_rows.get(document_id)
                if not row or row.get("userId") != user_id:
                    return None
                return PersonalRoadmap(**row)

        from firebase_admin import firestore

        snapshot = firestore.client().collection(COLLECTION).document(document_id).get()
        if not snapshot.exists:
            return None
        row = snapshot.to_dict() or {}
        if row.get("userId") != user_id:
            return None
        return PersonalRoadmap(**row)

    def current(self, user_id: str) -> PersonalRoadmap | None:
        if self._is_demo():
            with _demo_lock:
                rows = [row for row in _demo_rows.values() if row.get("userId") == user_id]
            rows.sort(key=lambda row: row.get("period", {}).get("start", ""), reverse=True)
            return PersonalRoadmap(**rows[0]) if rows else None

        from firebase_admin import firestore

        rows = [
            snapshot.to_dict() or {}
            for snapshot in firestore.client().collection(COLLECTION)
            .where("userId", "==", user_id).stream()
        ]
        rows.sort(key=lambda row: row.get("period", {}).get("start", ""), reverse=True)
        return PersonalRoadmap(**rows[0]) if rows else None

    def first(self, user_id: str) -> PersonalRoadmap | None:
        """Return the first roadmap, which owns the fixed goal-month anchor."""
        if self._is_demo():
            with _demo_lock:
                rows = [row for row in _demo_rows.values() if row.get("userId") == user_id]
            rows.sort(key=lambda row: row.get("period", {}).get("start", ""))
            return PersonalRoadmap(**rows[0]) if rows else None

        from firebase_admin import firestore

        rows = [
            snapshot.to_dict() or {}
            for snapshot in firestore.client().collection(COLLECTION)
            .where("userId", "==", user_id).stream()
        ]
        rows.sort(key=lambda row: row.get("period", {}).get("start", ""))
        return PersonalRoadmap(**rows[0]) if rows else None
