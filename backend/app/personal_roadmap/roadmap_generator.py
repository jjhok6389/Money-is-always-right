"""Build a correction -> automation -> expansion three-month story."""

from __future__ import annotations

from app.personal_roadmap.candidate_actions import ActionCandidate, RoadmapPhase
from app.personal_roadmap.models import RoadmapMonth


def add_months(month: str, offset: int) -> str:
    year, month_number = map(int, month.split("-"))
    index = year * 12 + month_number - 1 + offset
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


def _phase_candidates(
    candidates: list[ActionCandidate],
    phase: RoadmapPhase,
) -> list[ActionCandidate]:
    return [candidate for candidate in candidates if candidate.phase == phase]


def generate_months(start_month: str, candidates: list[ActionCandidate]) -> list[RoadmapMonth]:
    correction_options = _phase_candidates(candidates, "CORRECTION")
    if not correction_options:
        raise ValueError("교정 단계 행동 후보가 없습니다.")
    correction = correction_options[0]

    automation_options = [
        candidate
        for candidate in _phase_candidates(candidates, "AUTOMATION")
        if not candidate.follows or correction.action.actionType in candidate.follows
    ]
    if not automation_options:
        raise ValueError("선택된 교정 행동과 연결되는 자동화 행동이 없습니다.")
    automation = automation_options[0]

    expansion_options = _phase_candidates(candidates, "EXPANSION")
    if not expansion_options:
        raise ValueError("확장 단계 행동 후보가 없습니다.")
    expansion = expansion_options[0]

    actions = [correction.action, automation.action, expansion.action]
    if automation.action.expectedEffect is not None or automation.action.basis is not None:
        raise ValueError("자동화 단계에는 교정 단계의 계산 효과를 복제할 수 없습니다.")
    if expansion.action.expectedEffect is not None or expansion.action.basis is not None:
        raise ValueError("확장 단계에는 계산되지 않은 투자·상환 효과를 표시할 수 없습니다.")
    if len({action.actionType for action in actions}) != 3:
        raise ValueError("월별 핵심 행동 유형이 중복됩니다.")
    normalized_titles = {" ".join(action.title.split()).casefold() for action in actions}
    if len(normalized_titles) != 3:
        raise ValueError("월별 핵심 행동 제목이 중복됩니다.")

    statuses = ("CURRENT", "PLANNED", "EXPECTED")
    return [
        RoadmapMonth(
            month=add_months(start_month, index),
            status=statuses[index],
            primaryAction=actions[index],
        )
        for index in range(3)
    ]
