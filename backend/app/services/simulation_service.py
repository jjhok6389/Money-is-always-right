"""
Digital twin simulation engine.

Projects future asset balances for a baseline roadmap vs. a user-adjusted
scenario (income, expenses, savings rate, interest rate).
Debt: monthly savings budget repays loans (high rate first) before investing.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from app.models.holdings import HoldingLoan
from app.models.simulation import (
    ScenarioSummary,
    SimulationAssumptions,
    SimulationRequest,
    SimulationResponse,
    TrajectoryPoint,
)
from app.models.transaction import FinancialSummary
from app.services import debt_simulation


def monthly_deposit(assumptions: SimulationAssumptions) -> int:
    surplus = max(assumptions.monthlyIncome - assumptions.monthlyExpenses, 0)
    return int(round(surplus * (assumptions.savingsRate / 100.0)))


def monthly_surplus(assumptions: SimulationAssumptions) -> int:
    return max(assumptions.monthlyIncome - assumptions.monthlyExpenses, 0)


def _month_label(start: datetime, month_index: int) -> str:
    year = start.year + (start.month - 1 + month_index) // 12
    month = (start.month - 1 + month_index) % 12 + 1
    return f"{year}-{month:02d}"


def project_balance(
    assumptions: SimulationAssumptions,
    loan_states: list[debt_simulation.LoanState] | None = None,
) -> tuple[list[int], list[int], list[int], Optional[int], int, Optional[int]]:
    """
    Return month-end assets, debt balances, net worth, first target-hit month,
    average monthly debt payment, and first debt-free month.
    """
    deposit_intent = monthly_deposit(assumptions)
    capacity = monthly_surplus(assumptions)
    monthly_rate = assumptions.annualInterestRate / 100.0 / 12.0
    states = debt_simulation.clone_loan_states(loan_states or [])

    assets = [int(assumptions.currentAssets)]
    debts = [debt_simulation.total_debt_balance(states)]
    net_worths = [assets[0] - debts[0]]
    hit_month: Optional[int] = 0 if (
        assumptions.targetAssetAmount > 0
        and assumptions.currentAssets >= assumptions.targetAssetAmount
    ) else None
    debt_free_month: Optional[int] = 0 if not states else None
    debt_payments: list[int] = []

    balance = float(assumptions.currentAssets)
    for month in range(1, assumptions.horizonMonths + 1):
        balance = balance * (1 + monthly_rate)
        paid = 0
        debt_after = debts[-1]
        if states:
            paid, debt_after = debt_simulation.apply_monthly_debt_payments(
                states, deposit_intent, capacity
            )
            if debt_free_month is None and debt_after <= 0:
                debt_free_month = month
        invest = max(deposit_intent - paid, 0)
        balance += invest
        rounded = int(round(balance))
        assets.append(rounded)
        debts.append(int(debt_after))
        net_worths.append(rounded - int(debt_after))
        debt_payments.append(int(paid))
        if (
            hit_month is None
            and assumptions.targetAssetAmount > 0
            and rounded >= assumptions.targetAssetAmount
        ):
            hit_month = month

    avg_debt_payment = int(round(sum(debt_payments) / len(debt_payments))) if debt_payments else 0
    return assets, debts, net_worths, hit_month, avg_debt_payment, debt_free_month


def _summary(
    assumptions: SimulationAssumptions,
    assets: list[int],
    debts: list[int],
    hit_month: Optional[int],
    start: datetime,
    avg_debt_payment: int,
    debt_free_month: Optional[int],
) -> ScenarioSummary:
    deposit_intent = monthly_deposit(assumptions)
    return ScenarioSummary(
        monthlyDeposit=deposit_intent,
        finalAssets=assets[-1] if assets else assumptions.currentAssets,
        targetHitMonth=hit_month,
        targetHitLabel=_month_label(start, hit_month) if hit_month is not None else None,
        surplusVsBaseline=0,
        monthlyDebtPayment=avg_debt_payment,
        finalDebtBalance=debts[-1] if debts else 0,
        debtFreeMonth=debt_free_month,
        monthlyInvestable=max(deposit_intent - avg_debt_payment, 0),
    )


def _insights(
    baseline: ScenarioSummary,
    scenario: ScenarioSummary,
    request: SimulationRequest,
    has_debt: bool,
) -> list[str]:
    notes: list[str] = []
    delta_deposit = scenario.monthlyDeposit - baseline.monthlyDeposit
    if delta_deposit > 0:
        notes.append(f"시나리오의 월 적립액이 기본 로드맵보다 {delta_deposit:,}원 많습니다.")
    elif delta_deposit < 0:
        notes.append(f"시나리오의 월 적립액이 기본 로드맵보다 {abs(delta_deposit):,}원 적습니다.")
    else:
        notes.append("월 적립액은 기본 로드맵과 동일합니다. 금리 차이가 궤적을 바꿉니다.")

    if has_debt:
        if scenario.monthlyDebtPayment > 0:
            notes.append(
                f"부채 상환에 월 평균 {scenario.monthlyDebtPayment:,}원이 우선 배정되며, "
                f"남는 {scenario.monthlyInvestable:,}원만 자산 적립에 쓰입니다."
            )
        if scenario.debtFreeMonth is not None and scenario.debtFreeMonth > 0:
            notes.append(f"현재 가정으로 부채는 약 {scenario.debtFreeMonth}개월 후 상환 완료 예상입니다.")
        elif scenario.finalDebtBalance > 0:
            notes.append(
                f"설정 기간 내 부채 잔액 {scenario.finalDebtBalance:,}원이 남을 수 있습니다. "
                "상환액·저축률을 조정해 보세요."
            )

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


def _loans_from_request(request: SimulationRequest) -> list[debt_simulation.LoanState]:
    if not request.loans:
        return []
    return [
        debt_simulation.LoanState(
            balance=loan.balance,
            interest_rate=loan.interestRate,
            monthly_payment=loan.monthlyPayment,
            institution=loan.institution or "",
            loan_name=loan.loanName or "",
        )
        for loan in request.loans
        if loan.balance > 0
    ]


def run_simulation(request: SimulationRequest) -> SimulationResponse:
    start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    loan_states = _loans_from_request(request)

    horizon = max(request.baseline.horizonMonths, request.scenario.horizonMonths)
    baseline_assumptions = request.baseline.model_copy(update={"horizonMonths": horizon})
    scenario_assumptions = request.scenario.model_copy(update={"horizonMonths": horizon})

    target = max(request.baseline.targetAssetAmount, request.scenario.targetAssetAmount)
    baseline_assumptions = baseline_assumptions.model_copy(update={"targetAssetAmount": target})
    scenario_assumptions = scenario_assumptions.model_copy(update={"targetAssetAmount": target})

    baseline_assets, baseline_debts, baseline_net, baseline_hit, baseline_debt_pay, baseline_debt_free = (
        project_balance(baseline_assumptions, loan_states)
    )
    scenario_loans = debt_simulation.clone_loan_states(loan_states)
    scenario_assets, scenario_debts, scenario_net, scenario_hit, scenario_debt_pay, scenario_debt_free = (
        project_balance(scenario_assumptions, scenario_loans)
    )

    trajectory = [
        TrajectoryPoint(
            monthIndex=index,
            label=_month_label(start, index),
            baselineAssets=baseline_assets[index],
            scenarioAssets=scenario_assets[index],
            targetAssetAmount=target,
            baselineDebtBalance=baseline_debts[index],
            scenarioDebtBalance=scenario_debts[index],
            baselineNetWorth=baseline_net[index],
            scenarioNetWorth=scenario_net[index],
        )
        for index in range(horizon + 1)
    ]

    baseline_summary = _summary(
        baseline_assumptions,
        baseline_assets,
        baseline_debts,
        baseline_hit,
        start,
        baseline_debt_pay,
        baseline_debt_free,
    )
    scenario_summary = _summary(
        scenario_assumptions,
        scenario_assets,
        scenario_debts,
        scenario_hit,
        start,
        scenario_debt_pay,
        scenario_debt_free,
    )
    scenario_summary.surplusVsBaseline = scenario_summary.finalAssets - baseline_summary.finalAssets

    return SimulationResponse(
        generatedAt=datetime.utcnow().isoformat() + "Z",
        trajectory=trajectory,
        baselineSummary=baseline_summary,
        scenarioSummary=scenario_summary,
        insights=_insights(baseline_summary, scenario_summary, request, bool(loan_states)),
    )


def assumptions_from_profile(profile: dict, current_assets: int | None = None) -> SimulationAssumptions:
    """Legacy compatibility helper. New service paths use financial summaries."""
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


def assumptions_from_financial_summary(
    financial_summary: FinancialSummary,
    profile: dict,
    current_assets: int | None = None,
) -> SimulationAssumptions:
    """Build baseline assumptions from the shared generated monthly summary."""
    income = financial_summary.totalIncome
    expenses = financial_summary.totalExpenses
    capacity = financial_summary.monthlySavingsCapacity
    surplus = max(income - expenses, 0)
    savings_rate = round((capacity / surplus) * 100, 2) if surplus else 0.0
    years = int(profile.get("targetYears") or 5)
    assets = current_assets if current_assets is not None else capacity * 6
    return SimulationAssumptions(
        monthlyIncome=income,
        monthlyExpenses=expenses,
        savingsRate=min(max(savings_rate, 0), 100),
        annualInterestRate=3.5,
        currentAssets=max(assets, 0),
        horizonMonths=max(years * 12, 12),
        targetAssetAmount=int(profile.get("targetAssetAmount") or 0),
    )


def loans_from_holdings(loans: list[HoldingLoan]) -> list:
    from app.models.simulation import SimulatedLoan

    return [
        SimulatedLoan(
            balance=int(loan.balance),
            interestRate=float(loan.interestRate),
            monthlyPayment=loan.monthlyPayment,
            institution=loan.institution,
            loanName=loan.loanName,
        )
        for loan in loans
        if int(loan.balance) > 0
    ]
