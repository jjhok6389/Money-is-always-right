"""
Build coaching report snapshots from dashboard + simulation.

Delta rule (deterministic):
  1. Prefer ~25% of the largest *variable* consumption category (min 1만원, max 여력의 20%).
  2. If no variable consumption, use 12% of monthly savings capacity (min 1만원).
  3. Cap delta so it never exceeds capacity or the chosen category amount.
Scenario applies the delta as a monthly expense cut (소비→자산형성).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from app.models.dashboard import DashboardRequest, ProfileSnapshot
from app.models.report import (
    AllocationSplit,
    CoachingReport,
    ConsumptionTopItem,
    GenerateReportRequest,
    ReportComparison,
    TrajectorySnap,
)
from app.models.simulation import SimulationRequest
from app.services import dashboard_service, firebase_service, report_store, simulation_service
from app.services.etf_store import POLICY_KO

DISCLAIMER = POLICY_KO.get(
    "disclaimer",
    "투자 권유가 아닙니다. 과거 지표와 시뮬레이션은 미래 수익을 보장하지 않습니다.",
)


def months_to_label(months: int | None) -> str | None:
    if months is None:
        return None
    if months <= 0:
        return "이미 달성"
    years, rem = divmod(int(months), 12)
    if years and rem:
        return f"{years}년 {rem}개월"
    if years:
        return f"{years}년"
    return f"{rem}개월"


def compute_delta(capacity: int, consumption: list[Any]) -> tuple[int, str | None]:
    """
    Returns (delta_won, top_variable_category_label).
    """
    capacity = max(int(capacity or 0), 0)
    variable = [
        c
        for c in consumption
        if getattr(c, "expenseType", None) == "variable" or (isinstance(c, dict) and c.get("expenseType") == "variable")
    ]

    def _amount(item: Any) -> int:
        return int(getattr(item, "amount", None) if not isinstance(item, dict) else item.get("amount") or 0)

    def _label(item: Any) -> str:
        if isinstance(item, dict):
            return str(item.get("categoryLabel") or item.get("category") or "변동 소비")
        return str(getattr(item, "categoryLabel", None) or getattr(item, "category", None) or "변동 소비")

    top_label: str | None = None
    if variable:
        top = max(variable, key=_amount)
        top_amt = _amount(top)
        top_label = _label(top)
        raw = max(10_000, int(round(top_amt * 0.25)))
    else:
        raw = max(10_000, int(round(capacity * 0.12))) if capacity else 10_000

    cap_max = max(10_000, int(round(capacity * 0.20))) if capacity else raw
    delta = min(raw, cap_max)
    if capacity > 0:
        delta = min(delta, capacity)
    if variable:
        delta = min(delta, _amount(top))
    return max(delta, 0), top_label


def build_insight(delta: int, top_label: str | None, has_consumption: bool) -> str:
    man = max(1, int(round(delta / 10_000)))
    if not has_consumption:
        return (
            "아직 소비 내역이 충분하지 않아 프로필의 고정지출과 저축 여력을 기준으로 살펴봤어요. "
            f"이번 달에는 월 {man}만원을 미래의 자산형성에 먼저 배분해보는 건 어떨까요?"
        )
    cat = top_label or "변동 소비"
    return (
        f"최근에는 {cat} 지출 비중이 가장 눈에 띄어요. "
        f"이번 달에는 이 항목에서 월 {man}만원을 자산형성으로 옮겨보는 건 어떨까요?"
    )


def allocate(monthly_deposit: int, propensity: str) -> AllocationSplit:
    deposit_total = max(int(monthly_deposit or 0), 0)
    if propensity == "stable" or deposit_total == 0:
        return AllocationSplit(deposit=deposit_total, etf=0)
    # Neutral+ : roughly half to deposit products, half to ETF sleeve.
    etf = deposit_total // 2
    return AllocationSplit(deposit=deposit_total - etf, etf=etf)


def _downsample_trajectory(points: list[Any], max_points: int = 73) -> list[TrajectorySnap]:
    if len(points) <= max_points:
        return [
            TrajectorySnap(
                monthIndex=p.monthIndex,
                label=p.label,
                baselineAssets=p.baselineAssets,
                scenarioAssets=p.scenarioAssets,
                targetAssetAmount=p.targetAssetAmount,
            )
            for p in points
        ]
    step = max(1, (len(points) - 1) // (max_points - 1))
    picked = list(points[::step])
    if picked[-1] is not points[-1]:
        picked.append(points[-1])
    return [
        TrajectorySnap(
            monthIndex=p.monthIndex,
            label=p.label,
            baselineAssets=p.baselineAssets,
            scenarioAssets=p.scenarioAssets,
            targetAssetAmount=p.targetAssetAmount,
        )
        for p in picked
    ]


def _comparison(previous: dict[str, Any], current_capacity: int, current_months: int | None, top: list[ConsumptionTopItem]) -> ReportComparison:
    prev_cap = int(previous.get("capacity") or 0)
    prev_months = previous.get("monthsScenario")
    prev_months_i = int(prev_months) if prev_months is not None else None
    months_delta = None
    if current_months is not None and prev_months_i is not None:
        months_delta = prev_months_i - current_months  # positive = faster

    prev_top = (previous.get("consumptionTop") or [{}])[0] if previous.get("consumptionTop") else {}
    cur_top = top[0] if top else None

    bits: list[str] = []
    cap_delta = current_capacity - prev_cap
    if cap_delta > 0:
        bits.append(f"월 여력이 {cap_delta:,}원 늘었어요.")
    elif cap_delta < 0:
        bits.append(f"월 여력이 {abs(cap_delta):,}원 줄었어요.")
    else:
        bits.append("월 여력은 지난 리포트와 비슷합니다.")

    if months_delta is not None:
        if months_delta > 0:
            bits.append(f"예상 달성 시점이 약 {months_delta}개월 앞당겨졌어요.")
        elif months_delta < 0:
            bits.append(f"예상 달성 시점이 약 {abs(months_delta)}개월 미뤄졌어요.")
        else:
            bits.append("예상 달성 기간은 지난번과 비슷합니다.")

    if cur_top and prev_top.get("categoryLabel"):
        prev_amt = int(prev_top.get("amount") or 0)
        if cur_top.categoryLabel == prev_top.get("categoryLabel") and cur_top.amount < prev_amt:
            bits.append(f"{cur_top.categoryLabel} 지출이 줄었습니다.")
        elif cur_top.categoryLabel == prev_top.get("categoryLabel") and cur_top.amount > prev_amt:
            bits.append(f"{cur_top.categoryLabel} 지출이 늘었어요.")

    return ReportComparison(
        previousReportId=str(previous.get("reportId") or ""),
        previousCreatedAt=previous.get("createdAt"),
        capacityDelta=cap_delta,
        monthsScenarioDelta=months_delta,
        previousCapacity=prev_cap,
        previousMonthsScenario=prev_months_i,
        previousMonthsScenarioLabel=previous.get("monthsScenarioLabel"),
        previousTopCategoryLabel=prev_top.get("categoryLabel"),
        previousTopCategoryAmount=int(prev_top["amount"]) if prev_top.get("amount") is not None else None,
        summaryText=" ".join(bits),
    )


async def generate_report(user_id: str, request: GenerateReportRequest) -> CoachingReport:
    stored = firebase_service.get_user_document(user_id)
    profile_payload = request.profile
    dash_req = DashboardRequest(
        profile=ProfileSnapshot(**profile_payload) if profile_payload else None,
        currentAssets=request.currentAssets,
    )
    dashboard = await dashboard_service.build_dashboard(user_id, stored, dash_req)

    profile = dash_req.profile
    if profile is None and stored:
        profile = ProfileSnapshot(
            displayName=stored.get("displayName"),
            monthlyIncome=int(stored.get("monthlyIncome") or 0),
            fixedExpenses=int(stored.get("fixedExpenses") or 0),
            estimatedMonthlySavings=int(stored.get("estimatedMonthlySavings") or 0),
            investmentPropensity=stored.get("investmentPropensity") or "neutral",
            targetAssetAmount=int(stored.get("targetAssetAmount") or 0),
            targetYears=int(stored.get("targetYears") or 1),
            goalDescription=stored.get("goalDescription") or "",
            age=stored.get("age"),
            occupation=stored.get("occupation"),
        )
    if profile is None:
        raise ValueError("온보딩 프로필이 필요합니다.")

    capacity = int(dashboard.goal.monthlySavingsCapacity or 0)
    consumption = list(dashboard.consumption or [])
    has_linked = len(consumption) > 0
    delta, top_label = compute_delta(capacity, consumption)

    # Profile dict for simulation assumptions.
    sim_profile = {
        "monthlyIncome": profile.monthlyIncome,
        "fixedExpenses": profile.fixedExpenses,
        "estimatedMonthlySavings": profile.estimatedMonthlySavings,
        "targetYears": profile.targetYears,
        "targetAssetAmount": profile.targetAssetAmount,
        "investmentPropensity": profile.investmentPropensity,
    }
    baseline = simulation_service.assumptions_from_profile(
        sim_profile,
        dashboard.goal.currentAssets,
    )
    scenario = baseline.model_copy(
        update={"monthlyExpenses": max(0, baseline.monthlyExpenses - delta)}
    )
    sim = simulation_service.run_simulation(
        SimulationRequest(
            baseline=baseline,
            scenario=scenario,
            label="소비 개선 시나리오",
        )
    )

    top_items = sorted(consumption, key=lambda c: c.amount, reverse=True)[:5]
    consumption_top = [
        ConsumptionTopItem(
            category=c.category,
            categoryLabel=c.categoryLabel,
            amount=c.amount,
        )
        for c in top_items
    ]
    if not consumption_top and profile.fixedExpenses > 0:
        consumption_top = [
            ConsumptionTopItem(
                category="fixed",
                categoryLabel="고정 지출(프로필)",
                amount=int(profile.fixedExpenses),
            )
        ]

    totals = dashboard.consumptionTotals or {}
    spend = int(totals.get("totalExpenses") or 0)
    if spend <= 0:
        spend = int(profile.fixedExpenses or 0)

    months_baseline = dashboard.goal.estimatedMonthsToGoal
    months_scenario = sim.scenarioSummary.targetHitMonth
    propensity = profile.investmentPropensity
    allocation = allocate(sim.scenarioSummary.monthlyDeposit, propensity)

    why: list[str] = []
    for item in (dashboard.roadmap or [])[:2]:
        why.append(f"{item.title}: {item.detail}")
    if not why:
        why.append("목표 기간과 저축 여력을 기준으로 예·적금과 투자 비중을 나눴습니다.")

    report_type = request.type
    previous = report_store.latest_report(user_id)
    # First report is always initial; subsequent generate defaults to monthly if asked.
    if previous is None:
        report_type = "initial"
    elif report_type == "initial" and previous is not None:
        # Allow explicit re-initial, but comparison only for monthly.
        pass

    comparison = None
    previous_id = None
    if report_type == "monthly" and previous is not None:
        previous_id = previous.get("reportId")
        comparison = _comparison(previous, capacity, months_scenario, consumption_top)

    report_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    report = CoachingReport(
        reportId=report_id,
        userId=user_id,
        createdAt=created_at,
        type=report_type,
        previousReportId=previous_id,
        displayName=profile.displayName or (stored or {}).get("displayName") or "",
        income=int(profile.monthlyIncome or 0),
        spend=spend,
        capacity=capacity,
        currentAssets=int(dashboard.goal.currentAssets or 0),
        targetAssets=int(dashboard.goal.targetAssetAmount or 0),
        targetYears=int(dashboard.goal.targetYears or profile.targetYears or 1),
        goalDescription=dashboard.goal.goalDescription or profile.goalDescription or "",
        onTrack=bool(dashboard.goal.onTrack),
        monthsBaseline=months_baseline,
        monthsScenario=months_scenario,
        monthsBaselineLabel=months_to_label(months_baseline),
        monthsScenarioLabel=months_to_label(months_scenario),
        delta=delta,
        insightText=build_insight(delta, top_label, has_linked),
        allocation=allocation,
        consumptionTop=consumption_top,
        hasLinkedConsumption=has_linked,
        trajectory=_downsample_trajectory(sim.trajectory),
        baselineFinalAssets=int(sim.baselineSummary.finalAssets or 0),
        scenarioFinalAssets=int(sim.scenarioSummary.finalAssets or 0),
        scenarioMonthlyDeposit=int(sim.scenarioSummary.monthlyDeposit or 0),
        propensity=propensity,  # type: ignore[arg-type]
        roadmapWhy=why,
        disclaimer=DISCLAIMER,
        comparison=comparison,
    )

    report_store.save_report(report.model_dump())
    return report


def get_report(user_id: str, report_id: str) -> Optional[CoachingReport]:
    row = report_store.get_report(report_id, user_id)
    if not row:
        return None
    return CoachingReport(**row)


def list_report_summaries(user_id: str) -> list[dict[str, Any]]:
    rows = report_store.list_reports(user_id)
    out = []
    for row in rows:
        out.append(
            {
                "reportId": row.get("reportId"),
                "createdAt": row.get("createdAt"),
                "type": row.get("type"),
                "capacity": row.get("capacity"),
                "targetAssets": row.get("targetAssets"),
                "monthsScenarioLabel": row.get("monthsScenarioLabel"),
                "insightText": row.get("insightText") or "",
            }
        )
    return out


def update_schedule(user_id: str, monthly_report_day: int | None) -> dict[str, Any]:
    return firebase_service.upsert_user_document(
        user_id,
        {"monthlyReportDay": monthly_report_day},
    )
