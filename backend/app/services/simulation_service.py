"""
Digital twin simulation engine.

Projects future asset balances for a baseline roadmap vs. a user-adjusted
scenario (income, expenses, savings rate, interest rate).
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from app.models.simulation import (
    ScenarioSummary,
    SimulationAssumptions,
    SimulationRequest,
    SimulationResponse,
    TrajectoryPoint,
)


def monthly_deposit(assumptions: SimulationAssumptions) -> int:
    surplus = max(assumptions.monthlyIncome - assumptions.monthlyExpenses, 0)
    return int(round(surplus * (assumptions.savingsRate / 100.0)))


def _month_label(start: datetime, month_index: int) -> str:
    year = start.year + (start.month - 1 + month_index) // 12
    month = (start.month - 1 + month_index) % 12 + 1
    return f"{year}-{month:02d}"


def project_balance(assumptions: SimulationAssumptions) -> tuple[list[int], Optional[int]]:
    """Return month-end balances (index 0 = starting assets) and first target-hit month."""
    deposit = monthly_deposit(assumptions)
    monthly_rate = assumptions.annualInterestRate / 100.0 / 12.0
    balances = [int(assumptions.currentAssets)]
    hit_month: Optional[int] = 0 if (
        assumptions.targetAssetAmount > 0
        and assumptions.currentAssets >= assumptions.targetAssetAmount
    ) else None

    balance = float(assumptions.currentAssets)
    for month in range(1, assumptions.horizonMonths + 1):
        balance = balance * (1 + monthly_rate) + deposit
        rounded = int(round(balance))
        balances.append(rounded)
        if (
            hit_month is None
            and assumptions.targetAssetAmount > 0
            and rounded >= assumptions.targetAssetAmount
        ):
            hit_month = month

    return balances, hit_month


def _summary(
    assumptions: SimulationAssumptions,
    balances: list[int],
    hit_month: Optional[int],
    start: datetime,
) -> ScenarioSummary:
    return ScenarioSummary(
        monthlyDeposit=monthly_deposit(assumptions),
        finalAssets=balances[-1] if balances else assumptions.currentAssets,
        targetHitMonth=hit_month,
        targetHitLabel=_month_label(start, hit_month) if hit_month is not None else None,
        surplusVsBaseline=0,
    )


def _insights(
    baseline: ScenarioSummary,
    scenario: ScenarioSummary,
    request: SimulationRequest,
) -> list[str]:
    notes: list[str] = []
    delta_deposit = scenario.monthlyDeposit - baseline.monthlyDeposit
    if delta_deposit > 0:
        notes.append(f"시나리오의 월 적립액이 기본 로드맵보다 {delta_deposit:,}원 많습니다.")
    elif delta_deposit < 0:
        notes.append(f"시나리오의 월 적립액이 기본 로드맵보다 {abs(delta_deposit):,}원 적습니다.")
    else:
        notes.append("월 적립액은 기본 로드맵과 동일합니다. 금리 차이가 궤적을 바꿉니다.")

    rate_delta = request.scenario.annualInterestRate - request.baseline.annualInterestRate
    if abs(rate_delta) >= 0.05:
        direction = "높여" if rate_delta > 0 else "낮춰"
        notes.append(f"예상 금리를 {abs(rate_delta):.2f}%p {direction} 적용했습니다.")

    if scenario.targetHitMonth is not None and baseline.targetHitMonth is not None:
        diff = baseline.targetHitMonth - scenario.targetHitMonth
        if diff > 0:
            notes.append(f"목표 달성 시점이 약 {diff}개월 앞당겨질 수 있습니다.")
        elif diff < 0:
            notes.append(f"목표 달성 시점이 약 {abs(diff)}개월 미뤄질 수 있습니다.")
        else:
            notes.append("목표 달성 시점은 기본 로드맵과 비슷합니다.")
    elif scenario.targetHitMonth is not None and baseline.targetHitMonth is None:
        notes.append("시나리오에서는 설정 기간 안에 목표 자산 도달이 가능합니다.")
    elif scenario.targetHitMonth is None and baseline.targetHitMonth is not None:
        notes.append("시나리오에서는 설정 기간 안에 목표 도달이 어려울 수 있습니다.")
    else:
        notes.append("두 경로 모두 설정 기간 안에 목표 도달이 어렵습니다. 저축률·기간을 조정해 보세요.")

    surplus = scenario.finalAssets - baseline.finalAssets
    if surplus != 0:
        notes.append(
            f"시뮬레이션 종료 시점 자산 차이는 {surplus:+,}원입니다."
        )
    return notes


def run_simulation(request: SimulationRequest) -> SimulationResponse:
    start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Keep horizons aligned for chart comparison.
    horizon = max(request.baseline.horizonMonths, request.scenario.horizonMonths)
    baseline_assumptions = request.baseline.model_copy(update={"horizonMonths": horizon})
    scenario_assumptions = request.scenario.model_copy(update={"horizonMonths": horizon})

    # Share the same target line on the chart.
    target = max(request.baseline.targetAssetAmount, request.scenario.targetAssetAmount)
    baseline_assumptions = baseline_assumptions.model_copy(update={"targetAssetAmount": target})
    scenario_assumptions = scenario_assumptions.model_copy(update={"targetAssetAmount": target})

    baseline_balances, baseline_hit = project_balance(baseline_assumptions)
    scenario_balances, scenario_hit = project_balance(scenario_assumptions)

    trajectory = [
        TrajectoryPoint(
            monthIndex=index,
            label=_month_label(start, index),
            baselineAssets=baseline_balances[index],
            scenarioAssets=scenario_balances[index],
            targetAssetAmount=target,
        )
        for index in range(horizon + 1)
    ]

    baseline_summary = _summary(baseline_assumptions, baseline_balances, baseline_hit, start)
    scenario_summary = _summary(scenario_assumptions, scenario_balances, scenario_hit, start)
    scenario_summary.surplusVsBaseline = scenario_summary.finalAssets - baseline_summary.finalAssets

    return SimulationResponse(
        generatedAt=datetime.utcnow().isoformat() + "Z",
        trajectory=trajectory,
        baselineSummary=baseline_summary,
        scenarioSummary=scenario_summary,
        insights=_insights(baseline_summary, scenario_summary, request),
    )


def assumptions_from_profile(profile: dict, current_assets: int | None = None) -> SimulationAssumptions:
    income = int(profile.get("monthlyIncome") or 0)
    expenses = int(profile.get("fixedExpenses") or 0)
    estimated = int(profile.get("estimatedMonthlySavings") or max(income - expenses, 0))
    surplus = max(income - expenses, 0)
    savings_rate = round((estimated / surplus) * 100, 2) if surplus else 100.0
    savings_rate = min(max(savings_rate, 0), 100)
    years = int(profile.get("targetYears") or 5)
    assets = current_assets if current_assets is not None else estimated * 6
    return SimulationAssumptions(
        monthlyIncome=income,
        monthlyExpenses=expenses,
        savingsRate=savings_rate,
        annualInterestRate=3.5,
        currentAssets=max(assets, 0),
        horizonMonths=max(years * 12, 12),
        targetAssetAmount=int(profile.get("targetAssetAmount") or 0),
    )
