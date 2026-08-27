"""Orchestration for the deterministic three-month personal roadmap."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Awaitable, Callable

from app.models.dashboard import DashboardRequest, DashboardResponse, ProfileSnapshot
from app.personal_roadmap.candidate_actions import build_candidates
from app.personal_roadmap.financial_state import from_dashboard
from app.personal_roadmap.gap_adapter import analyze_gap
from app.personal_roadmap.long_term_plan import build_long_term_plan, month_distance
from app.personal_roadmap.models import (
    PersonalRoadmap,
    PersonalRoadmapGenerateRequest,
    RoadmapGoal,
    RoadmapPeriod,
)
from app.personal_roadmap.prioritizer import prioritize
from app.personal_roadmap.repository import PersonalRoadmapRepository
from app.personal_roadmap.roadmap_generator import add_months, generate_months
from app.services import dashboard_service, firebase_service, transaction_pipeline

DashboardBuilder = Callable[
    [str, dict[str, Any] | None, DashboardRequest],
    Awaitable[DashboardResponse],
]


def _month_from_created_at(value: Any) -> str | None:
    if isinstance(value, datetime):
        return value.strftime("%Y-%m")
    if isinstance(value, str) and len(value) >= 7:
        candidate = value[:7]
        try:
            year, month = map(int, candidate.split("-"))
        except ValueError:
            return None
        if year >= 2000 and 1 <= month <= 12:
            return candidate
    return None


def _explicit_target_month(stored: dict[str, Any] | None) -> str | None:
    if not stored:
        return None
    value = stored.get("targetMonth") or stored.get("goalTargetMonth")
    return str(value) if value else None


def _resolve_target_month(
    *,
    user_id: str,
    start_month: str,
    target_years: int,
    requested_target_month: str | None,
    stored: dict[str, Any] | None,
    repository: PersonalRoadmapRepository | None,
    dry_run: bool,
) -> str:
    if requested_target_month:
        return requested_target_month
    explicit = _explicit_target_month(stored)
    if explicit:
        return explicit
    created_value = None
    if stored:
        created_value = stored.get("goalStartedAt") or stored.get("createdAt")
    created_month = _month_from_created_at(created_value)
    if created_month:
        return add_months(created_month, target_years * 12)
    if not dry_run and repository is not None:
        first = repository.first(user_id)
        if first is not None:
            return first.goal.targetMonth
    return add_months(start_month, target_years * 12)


def _profile_from_stored(stored: dict[str, Any] | None) -> ProfileSnapshot | None:
    if not stored or stored.get("targetAssetAmount") is None or stored.get("targetYears") is None:
        return None
    return ProfileSnapshot(
        displayName=stored.get("displayName"),
        investmentPropensity=stored.get("investmentPropensity") or "neutral",
        targetAssetAmount=int(stored["targetAssetAmount"]),
        targetYears=int(stored["targetYears"]),
        goalDescription=stored.get("goalDescription") or "",
        age=stored.get("age"),
        occupation=stored.get("occupation"),
    )


async def _build_calculation_only_dashboard(
    user_id: str,
    _stored: dict[str, Any] | None,
    request: DashboardRequest,
) -> DashboardResponse:
    """Build dashboard-compatible state using local deterministic calculations only."""
    if request.profile is None:
        raise ValueError("온보딩 프로필이 필요합니다.")
    month = request.month or datetime.now(timezone.utc).strftime("%Y-%m")
    pipeline = transaction_pipeline.run_pipeline(
        user_id=user_id,
        month=month,
        count=transaction_pipeline.DEFAULT_TRANSACTION_COUNT,
    )
    summary = pipeline.financialSummary
    assets = dashboard_service._estimate_current_assets(
        summary.monthlySavingsCapacity,
        request.currentAssets,
    )
    consumption, totals = dashboard_service._build_consumption(pipeline)
    goal = dashboard_service._goal_progress(
        request.profile,
        assets,
        summary.monthlySavingsCapacity,
    )
    return DashboardResponse(
        generatedAt=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        month=month,
        portfolio=dashboard_service._build_portfolio(assets, request.profile.investmentPropensity),
        consumption=consumption,
        consumptionTotals=totals,
        financialSummary=summary,
        goal=goal,
        roadmap=[],
        recommendedProducts=[],
        recommendedEtfs=[],
        debtRepaymentPriority=[],
        etfMessage="Dry Run에서는 상품 및 ETF 후보를 조회하지 않습니다.",
    )


async def generate_personal_roadmap(
    user_id: str,
    request: PersonalRoadmapGenerateRequest,
    *,
    stored_profile: dict[str, Any] | None = None,
    dashboard_builder: DashboardBuilder | None = None,
    repository: PersonalRoadmapRepository | None = None,
    dry_run: bool = False,
) -> PersonalRoadmap:
    stored = stored_profile
    if stored is None:
        stored = firebase_service.get_user_document(user_id)
    profile = request.profile or _profile_from_stored(stored)
    if profile is None:
        raise ValueError("온보딩 프로필 또는 목표금액·목표기간 입력이 필요합니다.")

    stored_assets = stored.get("currentAssets") if stored else None
    current_assets = request.currentAssets if request.currentAssets is not None else stored_assets
    current_assets_estimated = current_assets is None

    stored_debt = stored.get("debtBalance") if stored else None
    debt_value = request.debtBalance if request.debtBalance is not None else stored_debt
    debt_known = debt_value is not None
    debt_balance = int(debt_value) if debt_value is not None else 0

    month = request.month or datetime.now(timezone.utc).strftime("%Y-%m")
    roadmap_repository = repository
    if not dry_run and roadmap_repository is None:
        roadmap_repository = PersonalRoadmapRepository()
    target_month = _resolve_target_month(
        user_id=user_id,
        start_month=month,
        target_years=profile.targetYears,
        requested_target_month=request.targetMonth,
        stored=stored,
        repository=roadmap_repository,
        dry_run=dry_run,
    )
    remaining_months = max(month_distance(month, target_month), 0)
    if remaining_months > 480:
        raise ValueError("목표 월은 현재 기준 40년 이내여야 합니다.")
    dashboard_request = DashboardRequest(
        profile=profile,
        currentAssets=int(current_assets) if current_assets is not None else None,
        debtBalance=debt_balance,
        month=month,
    )
    builder = dashboard_builder or (
        _build_calculation_only_dashboard if dry_run else dashboard_service.build_dashboard
    )
    dashboard = await builder(user_id, stored, dashboard_request)
    state = from_dashboard(
        dashboard,
        profile=profile,
        debt_balance=debt_balance,
        debt_balance_known=debt_known,
        current_assets_estimated=current_assets_estimated,
    )
    gap = analyze_gap(state, horizon_months=remaining_months)
    months = generate_months(month, prioritize(build_candidates(state, gap)))
    long_term_plan = build_long_term_plan(month, target_month, months)

    roadmap = PersonalRoadmap(
        roadmapId=f"{user_id}_{month}",
        userId=user_id,
        generatedAt=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        period=RoadmapPeriod(start=month, end=target_month),
        dataQuality=state.data_quality,
        goal=RoadmapGoal(
            targetAmount=profile.targetAssetAmount,
            targetYears=profile.targetYears,
            targetMonth=target_month,
            goalDescription=profile.goalDescription,
        ),
        projectedGap=gap.projected_gap,
        investmentPropensity=profile.investmentPropensity,
        months=months,
        longTermPlan=long_term_plan,
    )
    if request.persist and not dry_run:
        roadmap = roadmap_repository.save(roadmap)
    return roadmap
