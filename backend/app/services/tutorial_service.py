"""Deterministic tutorial progress and idempotent Demo reward handling."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.models.tutorial import TutorialProgressResponse
from app.services import firebase_service

CHAPTER_IDS = (
    "salary",
    "cashflow",
    "savings",
    "investment-risk",
    "etf-diversification",
    "financial-safety",
)
MIDPOINT_CHAPTER_IDS = CHAPTER_IDS[:3]
MIDPOINT_REWARD_IDS = {
    "demo-convenience",
    "demo-cafe",
    "demo-transport",
}
FINAL_REWARD_ID = "demo-virtual-etf-share"
CONTENT_VERSION = 1


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _chapter_state(value: Any) -> dict[str, Any]:
    if isinstance(value, bool):
        return {"completed": value, "completedAt": None}
    if not isinstance(value, dict):
        return {"completed": False, "completedAt": None}
    return {
        "completed": bool(value.get("completed")),
        "completedAt": value.get("completedAt"),
    }


def _reward_state(value: Any, legacy_claimed: bool = False) -> dict[str, Any]:
    if not isinstance(value, dict):
        value = {}
    return {
        "claimed": bool(value.get("claimed", legacy_claimed)),
        "rewardId": value.get("rewardId"),
        "claimedAt": value.get("claimedAt"),
    }


def normalize_progress(raw: dict[str, Any] | None) -> dict[str, Any]:
    raw = raw if isinstance(raw, dict) else {}
    raw_chapters = raw.get("chapters") if isinstance(raw.get("chapters"), dict) else {}
    chapters = {
        chapter_id: _chapter_state(
            raw_chapters.get(chapter_id, raw.get(f"chapter{index}"))
        )
        for index, chapter_id in enumerate(CHAPTER_IDS, start=1)
    }
    return {
        "contentVersion": CONTENT_VERSION,
        "chapters": chapters,
        "midpointReward": _reward_state(
            raw.get("midpointReward"),
            bool(raw.get("midpointRewardClaimed")),
        ),
        "finalReward": _reward_state(
            raw.get("finalReward"),
            bool(raw.get("finalRewardClaimed")),
        ),
        "updatedAt": raw.get("updatedAt"),
    }


def _response(progress: dict[str, Any]) -> TutorialProgressResponse:
    normalized = normalize_progress(progress)
    completed_count = sum(
        1 for state in normalized["chapters"].values() if state["completed"]
    )
    return TutorialProgressResponse(
        **normalized,
        completedCount=completed_count,
        totalChapters=len(CHAPTER_IDS),
    )


def get_progress(user_id: str) -> TutorialProgressResponse:
    stored = firebase_service.get_user_document(user_id) or {}
    return _response(stored.get("tutorialProgress"))


def complete_chapter(user_id: str, chapter_id: str) -> TutorialProgressResponse:
    if chapter_id not in CHAPTER_IDS:
        raise ValueError("존재하지 않는 튜토리얼 챕터입니다.")

    def update(raw: dict[str, Any]) -> dict[str, Any]:
        progress = normalize_progress(raw)
        chapter_index = CHAPTER_IDS.index(chapter_id)
        if chapter_index > 0:
            previous_chapter_id = CHAPTER_IDS[chapter_index - 1]
            if not progress["chapters"][previous_chapter_id]["completed"]:
                raise ValueError("이전 챕터를 먼저 완료해주세요.")
        chapter = progress["chapters"][chapter_id]
        if not chapter["completed"]:
            chapter["completed"] = True
            chapter["completedAt"] = _now()
        progress["updatedAt"] = _now()
        return progress

    saved = firebase_service.update_tutorial_progress(user_id, update)
    return _response(saved)


def claim_midpoint_reward(user_id: str, reward_id: str) -> TutorialProgressResponse:
    if reward_id not in MIDPOINT_REWARD_IDS:
        raise ValueError("선택할 수 없는 Demo 보상입니다.")

    def update(raw: dict[str, Any]) -> dict[str, Any]:
        progress = normalize_progress(raw)
        if not all(progress["chapters"][item]["completed"] for item in MIDPOINT_CHAPTER_IDS):
            raise ValueError("중간 보상은 앞의 3개 챕터를 완료한 후 받을 수 있습니다.")
        reward = progress["midpointReward"]
        if not reward["claimed"]:
            reward.update({"claimed": True, "rewardId": reward_id, "claimedAt": _now()})
            progress["updatedAt"] = _now()
        return progress

    saved = firebase_service.update_tutorial_progress(user_id, update)
    return _response(saved)


def claim_final_reward(user_id: str) -> TutorialProgressResponse:
    def update(raw: dict[str, Any]) -> dict[str, Any]:
        progress = normalize_progress(raw)
        if not all(progress["chapters"][item]["completed"] for item in CHAPTER_IDS):
            raise ValueError("최종 보상은 6개 챕터를 모두 완료한 후 받을 수 있습니다.")
        reward = progress["finalReward"]
        if not reward["claimed"]:
            reward.update(
                {"claimed": True, "rewardId": FINAL_REWARD_ID, "claimedAt": _now()}
            )
            progress["updatedAt"] = _now()
        return progress

    saved = firebase_service.update_tutorial_progress(user_id, update)
    return _response(saved)
