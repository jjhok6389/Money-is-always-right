"""Build phase-specific actions from the financial state and existing calculators."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.personal_roadmap.financial_state import RoadmapFinancialState
from app.personal_roadmap.gap_adapter import GapAnalysis
from app.personal_roadmap.models import ActionType, ExecutionMeans, RoadmapAction

RoadmapPhase = Literal["CORRECTION", "AUTOMATION", "EXPANSION"]
INVESTMENT_DISCLAIMER = "투자 권유가 아니며 기대수익과 미래 자산 효과는 계산하지 않습니다."


@dataclass(frozen=True)
class ActionCandidate:
    action: RoadmapAction
    phase: RoadmapPhase
    safety_rank: int
    impact_rank: int
    follows: tuple[ActionType, ...] = ()


def _product_means(state: RoadmapFinancialState) -> list[ExecutionMeans]:
    return [
        ExecutionMeans(
            type="PRODUCT",
            title=f"{item.companyName} {item.productName}",
            identifier=f"{item.companyName}:{item.productName}",
            detail=item.reason,
        )
        for item in [
            product
            for product in state.recommended_products
            if product.productType in {"deposit", "saving"}
        ][:3]
    ]


def _etf_means(state: RoadmapFinancialState) -> list[ExecutionMeans]:
    return [
        ExecutionMeans(
            type="ETF",
            title=item.name,
            identifier=item.symbol,
            detail=item.reason,
        )
        for item in state.recommended_etfs[:3]
    ]


def _correction_candidates(
    state: RoadmapFinancialState,
    gap: GapAnalysis,
    *,
    cashflow_risk: bool,
    debt_risk: bool,
) -> list[ActionCandidate]:
    candidates: list[ActionCandidate] = []
    if cashflow_risk:
        candidates.append(ActionCandidate(
            action=RoadmapAction(
                actionType="IMPROVE_CASH_FLOW",
                title="월 현금유출 구조 점검",
                reason="저축·투자 이체를 포함한 월 현금흐름이 적자이거나 저축 여력이 부족합니다.",
                calculationUnavailableReason="저축과 투자 이체액이 분리되지 않아 세부 절감 효과는 계산하지 않습니다.",
            ),
            phase="CORRECTION",
            safety_rank=0,
            impact_rank=0,
        ))
    if debt_risk:
        candidates.append(ActionCandidate(
            action=RoadmapAction(
                actionType="REVIEW_DEBT",
                title="부채 금리와 상환 조건 확인",
                reason="부채 잔액이 있으므로 투자 전에 금리·종류·중도상환 조건을 먼저 확인합니다.",
                calculationUnavailableReason="부채 금리와 종류가 없어 상환 이자 절감액은 계산할 수 없습니다.",
            ),
            phase="CORRECTION",
            safety_rank=1,
            impact_rank=0,
        ))
    if gap.projected_gap.baselineShortfall > 0 and gap.reduction_amount > 0:
        label = gap.reduction_category or "변동 소비"
        candidates.append(ActionCandidate(
            action=RoadmapAction(
                actionType="REDUCE_VARIABLE_SPENDING",
                title=f"{label} 월 {gap.reduction_amount:,}원 절감",
                reason="현재 계산상 목표일까지 예상 자산이 목표금액에 미치지 못합니다.",
                expectedEffect=gap.expected_effect,
                basis=gap.basis,
            ),
            phase="CORRECTION",
            safety_rank=2,
            impact_rank=0,
        ))
    if state.summary.monthlySavingsCapacity > 0:
        candidates.append(ActionCandidate(
            action=RoadmapAction(
                actionType="MAINTAIN_SAVING",
                title="현재 저축 흐름의 기준선 확정",
                reason=(
                    f"현재 금융데이터에서 확인된 월 저축 여력 {state.summary.monthlySavingsCapacity:,}원을 "
                    "유지할 수 있는지 먼저 점검합니다."
                ),
            ),
            phase="CORRECTION",
            safety_rank=5,
            impact_rank=1,
        ))
    return candidates


def _automation_candidates(
    state: RoadmapFinancialState,
    gap: GapAnalysis,
    *,
    cashflow_risk: bool,
    debt_risk: bool,
) -> list[ActionCandidate]:
    candidates: list[ActionCandidate] = []
    if cashflow_risk:
        candidates.append(ActionCandidate(
            action=RoadmapAction(
                actionType="AUTOMATE_CASH_FLOW",
                title="급여일 기준으로 결제일과 저축일 정리",
                reason="첫 달에 확인한 현금유출이 반복되지 않도록 결제와 저축 일정을 한 흐름으로 정리합니다.",
            ),
            phase="AUTOMATION",
            safety_rank=0,
            impact_rank=0,
            follows=("IMPROVE_CASH_FLOW",),
        ))
    if debt_risk:
        candidates.append(ActionCandidate(
            action=RoadmapAction(
                actionType="AUTOMATE_DEBT_PAYMENT",
                title="확인한 부채 상환 일정을 자동 납부로 설정",
                reason="첫 달에 확인한 실제 상환 조건을 기준으로 납부가 빠지지 않도록 반복 구조를 만듭니다.",
                calculationUnavailableReason="월 상환 가능액과 금리 정보가 없어 자동 납부 금액은 제시하지 않습니다.",
            ),
            phase="AUTOMATION",
            safety_rank=1,
            impact_rank=0,
            follows=("REVIEW_DEBT",),
        ))
    if gap.projected_gap.baselineShortfall > 0 and gap.reduction_amount > 0:
        candidates.append(ActionCandidate(
            action=RoadmapAction(
                actionType="AUTOMATE_SAVING",
                title=f"절감한 월 {gap.reduction_amount:,}원을 급여일 자동이체로 전환",
                reason="첫 달에 확보한 금액이 일회성 절감으로 끝나지 않도록 매월 같은 날 저축합니다.",
            ),
            phase="AUTOMATION",
            safety_rank=2,
            impact_rank=0,
            follows=("REDUCE_VARIABLE_SPENDING",),
        ))
    if state.summary.monthlySavingsCapacity > 0:
        candidates.append(ActionCandidate(
            action=RoadmapAction(
                actionType="AUTOMATE_SAVING",
                title="현재 저축 흐름을 급여일 자동이체로 고정",
                reason="첫 달에 확인한 저축 여력이 매월 반복되도록 저축 시점과 계좌를 고정합니다.",
            ),
            phase="AUTOMATION",
            safety_rank=5,
            impact_rank=1,
            follows=("MAINTAIN_SAVING",),
        ))
    return candidates


def _expansion_candidate(
    state: RoadmapFinancialState,
    gap: GapAnalysis,
    *,
    cashflow_risk: bool,
    debt_risk: bool,
) -> ActionCandidate:
    if cashflow_risk:
        return ActionCandidate(
            action=RoadmapAction(
                actionType="CHECK_PROGRESS",
                title="개선된 현금흐름을 다음 달 데이터로 재점검",
                reason="현재 현금흐름이 불안정하므로 투자로 넓히기 전에 교정과 자동화가 실제로 유지됐는지 확인합니다.",
            ),
            phase="EXPANSION",
            safety_rank=0,
            impact_rank=0,
        )
    if debt_risk:
        return ActionCandidate(
            action=RoadmapAction(
                actionType="EXPAND_DEBT_REPAYMENT",
                title="자동 납부 정착 후 추가 상환 계획 검토",
                reason="부채가 확인되어 투자보다 실제 금리와 상환 조건에 맞춘 추가 상환 가능 여부를 먼저 검토합니다.",
                calculationUnavailableReason="금리와 월 상환 가능액이 없어 이자 절감액과 상환 기간은 계산하지 않습니다.",
            ),
            phase="EXPANSION",
            safety_rank=1,
            impact_rank=0,
        )
    if not state.debt_balance_known or state.current_assets_estimated:
        return ActionCandidate(
            action=RoadmapAction(
                actionType="CHECK_EMERGENCY_FUND",
                title="확보한 여력을 확장하기 전 안전자금 점검",
                reason="부채 잔액 또는 현재 자산이 확정되지 않아 투자보다 현금성 비상자금 보유 기간을 먼저 확인합니다.",
                calculationUnavailableReason="현금성 자산 규모를 알 수 없어 부족액은 계산하지 않습니다.",
            ),
            phase="EXPANSION",
            safety_rank=2,
            impact_rank=0,
        )

    propensity = state.profile.investmentPropensity
    products = _product_means(state)
    etfs = _etf_means(state)
    if propensity == "stable":
        action = RoadmapAction(
            actionType="REVIEW_SAVING_PRODUCT",
            title="자동화한 저축을 예·적금 실행 수단으로 확장",
            reason="안정형 성향을 반영해 기존 예·적금 후보부터 비교합니다.",
            executionMeans=products,
        )
    elif propensity == "stable_seeking" and etfs:
        action = RoadmapAction(
            actionType="REVIEW_ETF_INVESTMENT",
            title="저축 기반 위에서 저변동 ETF 검토",
            reason="자동화한 저축을 유지하면서 기존 추천 정책이 허용한 ETF 후보만 참고합니다.",
            executionMeans=etfs,
            calculationUnavailableReason="ETF 기대수익과 미래 자산 효과는 현재 계산할 수 없습니다.",
            investmentDisclaimer=INVESTMENT_DISCLAIMER,
        )
    elif propensity in {"neutral", "aggressive", "very_aggressive"} and etfs:
        action = RoadmapAction(
            actionType="REVIEW_ETF_INVESTMENT",
            title="확보한 여력의 ETF 적립식 투자 가능 여부 검토",
            reason="현금흐름과 부채 안전 조건을 확인한 뒤 투자성향에 허용된 후보를 실행 수단으로 검토합니다.",
            executionMeans=etfs,
            calculationUnavailableReason="ETF 기대수익과 미래 자산 효과는 현재 계산할 수 없습니다.",
            investmentDisclaimer=INVESTMENT_DISCLAIMER,
        )
    else:
        action = RoadmapAction(
            actionType="REVIEW_SAVING_PRODUCT",
            title="확보한 여력을 저축 실행 수단으로 확장",
            reason="현재 연결 가능한 ETF 후보가 없어 기존 예·적금 후보부터 비교합니다.",
            executionMeans=products,
        )
    return ActionCandidate(
        action=action,
        phase="EXPANSION",
        safety_rank=3,
        impact_rank=1 if gap.projected_gap.baselineShortfall > 0 else 2,
    )


def build_candidates(state: RoadmapFinancialState, gap: GapAnalysis) -> list[ActionCandidate]:
    cashflow_risk = state.summary.netCashflow < 0 or state.summary.monthlySavingsCapacity <= 0
    debt_risk = state.debt_balance_known and state.debt_balance > 0
    return [
        *_correction_candidates(state, gap, cashflow_risk=cashflow_risk, debt_risk=debt_risk),
        *_automation_candidates(state, gap, cashflow_risk=cashflow_risk, debt_risk=debt_risk),
        _expansion_candidate(state, gap, cashflow_risk=cashflow_risk, debt_risk=debt_risk),
    ]
