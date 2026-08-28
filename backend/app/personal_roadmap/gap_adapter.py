"""Adapter around the existing deterministic What-if simulation service."""

from __future__ import annotations

from dataclasses import dataclass

from app.models.simulation import SimulationAssumptions, SimulationRequest
from app.personal_roadmap.financial_state import RoadmapFinancialState
from app.personal_roadmap.models import CalculationBasis, ExpectedEffect, ProjectedGap
from app.services import report_service, simulation_service


def _month_label(start_month: str, offset: int | None) -> str | None:
    if offset is None:
        return None
    year, month = map(int, start_month.split("-"))
    index = year * 12 + month - 1 + offset
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


@dataclass(frozen=True)
class GapAnalysis:
    projected_gap: ProjectedGap
    reduction_amount: int
    reduction_category: str | None
    baseline: SimulationAssumptions
    scenario: SimulationAssumptions
    expected_effect: ExpectedEffect | None
    basis: CalculationBasis | None


def analyze_gap(
    state: RoadmapFinancialState,
    *,
    horizon_months: int | None = None,
) -> GapAnalysis:
    profile = {
        "targetYears": state.profile.targetYears,
        "targetAssetAmount": state.profile.targetAssetAmount,
        "investmentPropensity": state.profile.investmentPropensity,
    }
    baseline = simulation_service.assumptions_from_financial_summary(
        state.summary,
        profile,
        state.current_assets,
    )
    effective_horizon = baseline.horizonMonths if horizon_months is None else horizon_months
    if not 0 <= effective_horizon <= 480:
        raise ValueError("남은 목표 기간은 0개월 이상 480개월 이하여야 합니다.")
    # The shared simulation model has a six-month minimum. For a nearer goal,
    # run that engine unchanged and read the trajectory at the actual goal month.
    engine_horizon = max(effective_horizon, 6)
    baseline = baseline.model_copy(update={"horizonMonths": engine_horizon})

    # compute_delta has a fallback amount. Only accept it when actual variable
    # consumption and savings capacity are both present.
    variable = [
        item
        for item in state.consumption
        if getattr(item, "expenseType", None) == "variable"
        or (isinstance(item, dict) and item.get("expenseType") == "variable")
    ]
    has_variable = state.summary.variableExpenses > 0 and bool(variable)
    reduction, category = report_service.compute_delta(
        state.summary.monthlySavingsCapacity,
        list(state.consumption) if has_variable else [],
    )
    if not has_variable or state.summary.monthlySavingsCapacity <= 0:
        reduction, category = 0, None

    scenario = baseline.model_copy(
        update={"monthlyExpenses": max(baseline.monthlyExpenses - reduction, 0)}
    )
    result = simulation_service.run_simulation(
        SimulationRequest(
            baseline=baseline,
            scenario=scenario,
            label="소비 절감 후 저축 전환 시나리오",
        )
    )
    horizon_point = result.trajectory[effective_horizon]
    baseline_hit = result.baselineSummary.targetHitMonth
    scenario_hit = result.scenarioSummary.targetHitMonth
    if baseline_hit is not None and baseline_hit > effective_horizon:
        baseline_hit = None
    if scenario_hit is not None and scenario_hit > effective_horizon:
        scenario_hit = None
    target = state.profile.targetAssetAmount
    baseline_final = horizon_point.baselineAssets
    scenario_final = horizon_point.scenarioAssets
    baseline_shortfall = max(target - baseline_final, 0)
    scenario_shortfall = max(target - scenario_final, 0)
    projected = ProjectedGap(
        currentAssetGap=state.current_asset_gap,
        baselineExpectedAmount=baseline_final,
        baselineShortfall=baseline_shortfall,
        baselineTargetHitMonth=baseline_hit,
        baselineTargetHitLabel=_month_label(
            state.month,
            baseline_hit,
        ),
    )

    effect = None
    basis = None
    if reduction > 0:
        months_saved = None
        if (
            baseline_hit is not None
            and scenario_hit is not None
        ):
            months_saved = baseline_hit - scenario_hit
        effect = ExpectedEffect(
            assumptionBased=True,
            baselineExpectedAmount=baseline_final,
            scenarioExpectedAmount=scenario_final,
            expectedAmountChange=scenario_final - baseline_final,
            shortfallBefore=baseline_shortfall,
            shortfallAfter=scenario_shortfall,
            estimatedMonthsSaved=months_saved,
        )
        basis = CalculationBasis(
            calculator="report_service.compute_delta + simulation_service.run_simulation",
            actionAmount=reduction,
            scenarioChanges={
                "monthlyExpensesDelta": -reduction,
                "baselineMonthlyExpenses": baseline.monthlyExpenses,
                "scenarioMonthlyExpenses": scenario.monthlyExpenses,
                "savingsRate": baseline.savingsRate,
            },
            annualInterestRate=baseline.annualInterestRate,
            horizonMonths=effective_horizon,
            note="기존 소비 절감 후보를 매월 저축 여력으로 전환한 가정입니다.",
        )

    return GapAnalysis(
        projected_gap=projected,
        reduction_amount=reduction,
        reduction_category=category,
        baseline=baseline,
        scenario=scenario,
        expected_effect=effect,
        basis=basis,
    )
