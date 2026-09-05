"""Compact full-horizon plan built around the three-month rolling window."""

from __future__ import annotations

from app.personal_roadmap.models import (
    LongTermPlan,
    LongTermSegment,
    RoadmapCheckpoint,
    RoadmapMonth,
)
from app.personal_roadmap.roadmap_generator import add_months


def month_distance(start_month: str, end_month: str) -> int:
    start_year, start_number = map(int, start_month.split("-"))
    end_year, end_number = map(int, end_month.split("-"))
    return (end_year - start_year) * 12 + end_number - start_number


def _maintenance_copy(months: list[RoadmapMonth]) -> tuple[str, str]:
    expansion_type = months[2].primaryAction.actionType
    if expansion_type == "EXPAND_DEBT_REPAYMENT":
        return (
            "자동 상환 흐름 유지",
            "설정한 상환 흐름을 유지하고, 점검 시 실제 잔액과 상환 조건을 다시 확인합니다.",
        )
    if expansion_type == "REVIEW_ETF_INVESTMENT":
        return (
            "저축 흐름 유지와 투자 여건 점검",
            "안전자금과 자동 저축을 유지하며, 점검 시 투자 가능 여건을 다시 판단합니다. 수익률은 미리 가정하지 않습니다.",
        )
    if expansion_type == "REVIEW_SAVING_PRODUCT":
        return (
            "자동 저축 흐름 유지",
            "자동 저축을 유지하고, 점검 시 실제 납입 상태와 상품 조건을 다시 확인합니다.",
        )
    return (
        "개선된 금융 행동 유지",
        "앞선 3개월에 만든 행동을 유지하고, 최신 금융데이터로 다음 실행 계획을 다시 계산합니다.",
    )


def build_long_term_plan(
    start_month: str,
    target_month: str,
    months: list[RoadmapMonth],
) -> LongTermPlan:
    raw_remaining = month_distance(start_month, target_month)
    remaining = max(raw_remaining, 0)
    target_review_required = raw_remaining < 0
    segments: list[LongTermSegment] = []
    checkpoints: list[RoadmapCheckpoint] = []

    if target_review_required:
        return LongTermPlan(
            remainingMonths=0,
            targetReviewRequired=True,
            checkpoints=[
                RoadmapCheckpoint(
                    month=target_month,
                    type="TARGET_REVIEW",
                    title="목표 기간 재설정 필요",
                    description="설정한 목표 월이 지났습니다. 목표 달성 여부를 확인하고 새로운 목표 기간을 정해 주세요.",
                )
            ],
        )

    title, description = _maintenance_copy(months)
    cursor = 3
    while cursor <= remaining:
        end_offset = min(cursor + 2, remaining)
        segment_end = add_months(start_month, end_offset)
        segments.append(
            LongTermSegment(
                startMonth=add_months(start_month, cursor),
                endMonth=segment_end,
                title=title,
                description=description,
            )
        )
        if end_offset < remaining:
            checkpoints.append(
                RoadmapCheckpoint(
                    month=segment_end,
                    type="RECALCULATE",
                    title="재무상태와 목표 Gap 다시 계산",
                    description="최근 소득·소비·자산·부채를 반영해 다음 3개월의 교정·자동화·확장 행동을 다시 정합니다.",
                )
            )
        cursor = end_offset + 1

    checkpoints.append(
        RoadmapCheckpoint(
            month=target_month,
            type="TARGET_REVIEW",
            title="목표 달성 여부 최종 확인",
            description="목표 월의 실제 자산과 목표금액을 비교하고 다음 목표를 결정합니다.",
        )
    )
    return LongTermPlan(
        remainingMonths=remaining,
        targetReviewRequired=False,
        segments=segments,
        checkpoints=checkpoints,
    )
