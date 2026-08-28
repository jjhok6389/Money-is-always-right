"""
Personalized dashboard engine.

Combines:
  - onboarding profile (propensity, goals)
  - transaction pipeline (monthly consumption / savings capacity)
  - holdings pipeline (Demo balance sheet → assets, debt, portfolio)
  - product catalog (deposit/saving recommendations)

Outputs portfolio allocation, goal gap metrics, and an actionable roadmap.
"""

from __future__ import annotations

import asyncio
from calendar import monthrange
from datetime import datetime
from typing import Any

from app.models.dashboard import (
    ConsumptionBar,
    DashboardRequest,
    DashboardResponse,
    GoalProgress,
    PortfolioSlice,
    RecommendedProduct,
    RoadmapItem,
    ProfileSnapshot,
)
from app.models.holdings import HoldingLoan, HoldingsSnapshot
from app.services import etf_recommendation, fss_client, holdings_pipeline, transaction_pipeline


def _add_months(base: datetime, months: int) -> datetime:
    year = base.year + (base.month - 1 + months) // 12
    month = (base.month - 1 + months) % 12 + 1
    day = min(base.day, monthrange(year, month)[1])
    return base.replace(year=year, month=month, day=day)


def _profile_from_document(doc: dict[str, Any] | None) -> ProfileSnapshot | None:
    if not doc:
        return None
    required = ("targetAssetAmount", "targetYears")
    if any(doc.get(key) is None for key in required):
        return None
    return ProfileSnapshot(
        displayName=doc.get("displayName"),
        investmentPropensity=doc.get("investmentPropensity") or "neutral",
        targetAssetAmount=int(doc["targetAssetAmount"]),
        targetYears=int(doc["targetYears"]),
        goalDescription=doc.get("goalDescription") or "",
        age=doc.get("age"),
        occupation=doc.get("occupation"),
    )


def _build_portfolio(snapshot: HoldingsSnapshot) -> list[PortfolioSlice]:
    slices_raw = holdings_pipeline.portfolio_from_holdings(snapshot)
    total = snapshot.totals.totalAssets
    slices: list[PortfolioSlice] = []
    for key, label, amount in slices_raw:
        slices.append(
            PortfolioSlice(
                key=key,
                label=label,
                amount=amount,
                ratio=round((amount / total) if total else 0, 4),
            )
        )
    return slices


def _build_consumption(pipeline_result) -> tuple[list[ConsumptionBar], dict]:
    bars = [
        ConsumptionBar(
            category=item.category,
            categoryLabel=item.categoryLabel,
            amount=item.totalAmount,
            expenseType=item.expenseType,
        )
        for item in pipeline_result.categorySummaries
        if item.expenseType in ("fixed", "variable")
    ]
    return bars, pipeline_result.totals


def _goal_progress(
    profile: ProfileSnapshot,
    current_assets: int,
    monthly_capacity: int,
) -> GoalProgress:
    target = max(profile.targetAssetAmount, 0)
    gap = max(target - current_assets, 0)
    rate = round((current_assets / target) * 100, 2) if target else 100.0

    estimated_months: int | None
    estimated_date: str | None
    if gap == 0:
        estimated_months = 0
        estimated_date = datetime.utcnow().strftime("%Y-%m-%d")
    elif monthly_capacity <= 0:
        estimated_months = None
        estimated_date = None
    else:
        estimated_months = int((gap + monthly_capacity - 1) // monthly_capacity)
        estimated_date = _add_months(datetime.utcnow(), estimated_months).strftime("%Y-%m-%d")

    target_months = profile.targetYears * 12
    on_track = estimated_months is not None and estimated_months <= target_months

    return GoalProgress(
        currentAssets=current_assets,
        targetAssetAmount=target,
        gapAmount=gap,
        achievementRate=min(rate, 100.0) if target else 100.0,
        monthlySavingsCapacity=monthly_capacity,
        estimatedMonthsToGoal=estimated_months,
        estimatedAchievementDate=estimated_date,
        onTrack=on_track,
        targetYears=profile.targetYears,
        goalDescription=profile.goalDescription,
    )


def _debt_item_from_loan(loan: HoldingLoan, priority: int, monthly_capacity: int) -> RoadmapItem:
    pay = loan.monthlyPayment or max(int(monthly_capacity * 0.3), 1)
    months = (loan.balance + pay - 1) // pay if pay else None
    detail = (
        f"{loan.institution} · 잔액 {loan.balance:,}원 · 연 {loan.interestRate:.1f}%"
        + (f" · 월 상환 약 {loan.monthlyPayment:,}원" if loan.monthlyPayment else "")
        + (f" · 현재 상환액 기준 약 {months}개월" if months else "")
    )
    return RoadmapItem(
        priority=priority,
        title=f"{loan.loanName} 우선 상환",
        detail=detail,
        category="debt",
    )


def _debt_priorities(snapshot: HoldingsSnapshot, monthly_capacity: int) -> list[RoadmapItem]:
    loans = holdings_pipeline.loans_by_rate_desc(snapshot)
    if not loans:
        return [
            RoadmapItem(
                priority=1,
                title="현재 확인된 부채 없음",
                detail="고금리 부채가 생기면 저축보다 상환을 우선하세요.",
                category="debt",
            )
        ]

    items = [
        _debt_item_from_loan(loan, index + 1, monthly_capacity)
        for index, loan in enumerate(loans)
    ]
    items.append(
        RoadmapItem(
            priority=len(items) + 1,
            title="상환 후 저축 재개",
            detail="부채 비율이 안정되면 목표 자산 적립 비중을 다시 높이세요.",
            category="debt",
        )
    )
    return items


def _roadmap(
    profile: ProfileSnapshot,
    goal: GoalProgress,
    consumption_totals: dict,
    debt_items: list[RoadmapItem],
) -> list[RoadmapItem]:
    variable = int(consumption_totals.get("variableExpenses") or 0)
    items: list[RoadmapItem] = [
        RoadmapItem(
            priority=1,
            title="월 저축 여력 확보",
            detail=(
                f"현재 예상 저축 여력은 월 {goal.monthlySavingsCapacity:,}원입니다. "
                f"목표 '{profile.goalDescription or '자산 목표'}' 달성을 위해 고정비를 유지하고 변동비 일부를 저축으로 전환하세요."
            ),
            category="savings",
        ),
        RoadmapItem(
            priority=2,
            title="변동 소비 점검",
            detail=f"이번 달 변동비는 {variable:,}원입니다. 식비·쇼핑·구독부터 10% 절감을 시도해 보세요.",
            category="spending",
        ),
        RoadmapItem(
            priority=3,
            title="추천 금융상품 가입",
            detail="투자 성향에 맞는 예·적금 상품을 로드맵 하단 추천에서 확인하세요.",
            category="product",
        ),
    ]
    if debt_items and debt_items[0].title != "현재 확인된 부채 없음":
        items.append(
            RoadmapItem(
                priority=4,
                title=debt_items[0].title,
                detail=debt_items[0].detail,
                category="debt",
            )
        )
    return items


def _recommend_products(products: list, propensity: str) -> list[RecommendedProduct]:
    reason_by_propensity = {
        "stable": "원금 손실을 허용하기 어려운 안정형 성향에 맞는 예·적금 중심 상품입니다.",
        "stable_seeking": "원금 손실을 최소화하려는 안정추구형에게 이자 수익이 안정적인 상품입니다.",
        "neutral": "수익과 안정성 균형을 찾는 위험중립형에게 중기 적립을 권장합니다.",
        "aggressive": "일정 손실을 감수하는 적극투자형이라면 우대 금리가 높은 상품을 우선 검토하세요.",
        "very_aggressive": "공격투자형이라도 예·적금은 안전자산 몫입니다. 목표 기간이 짧을수록 예금 비중을 배분하세요.",
    }
    reason = reason_by_propensity.get(propensity, reason_by_propensity["neutral"])
    ranked = sorted(products, key=lambda p: p.bestRate or 0, reverse=True)[:3]
    return [
        RecommendedProduct(
            productType=product.productType,
            companyName=product.companyName,
            productName=product.productName,
            bestRate=product.bestRate,
            bestTermMonths=product.bestTermMonths,
            reason=reason,
        )
        for product in ranked
    ]


async def build_dashboard(
    user_id: str,
    stored_profile: dict[str, Any] | None,
    request: DashboardRequest | None = None,
) -> DashboardResponse:
    request = request or DashboardRequest()
    profile = request.profile or _profile_from_document(stored_profile)
    if profile is None:
        raise ValueError("온보딩 프로필이 필요합니다.")

    month = request.month or datetime.utcnow().strftime("%Y-%m")
    as_of = f"{month}-01"
    pipeline = transaction_pipeline.run_pipeline(
        user_id=user_id,
        month=month,
        count=transaction_pipeline.DEFAULT_TRANSACTION_COUNT,
    )
    holdings = holdings_pipeline.run_pipeline(
        user_id=user_id,
        as_of=as_of,
        investment_propensity=profile.investmentPropensity,
    )
    financial_summary = pipeline.financialSummary
    monthly_capacity = financial_summary.monthlySavingsCapacity

    current_assets = holdings.totals.totalAssets
    portfolio = _build_portfolio(holdings)
    consumption, consumption_totals = _build_consumption(pipeline)
    goal = _goal_progress(profile, current_assets, monthly_capacity)
    debt_items = _debt_priorities(holdings, monthly_capacity)
    roadmap = _roadmap(profile, goal, consumption_totals, debt_items)

    saving_resp, deposit_resp, annuity_resp, etf_list = await asyncio.gather(
        fss_client.fetch_products("saving"),
        fss_client.fetch_products("deposit"),
        fss_client.fetch_products("annuity"),
        etf_recommendation.recommend_etfs(profile.investmentPropensity),
    )
    mixed = (
        list(saving_resp.products[:3])
        + list(deposit_resp.products[:2])
        + list(annuity_resp.products[:2])
    )
    recommended = _recommend_products(mixed, profile.investmentPropensity)

    return DashboardResponse(
        generatedAt=datetime.utcnow().isoformat() + "Z",
        month=month,
        portfolio=portfolio,
        consumption=consumption,
        consumptionTotals=consumption_totals,
        financialSummary=financial_summary,
        holdings=holdings,
        goal=goal,
        roadmap=roadmap,
        recommendedProducts=recommended,
        recommendedEtfs=etf_list.etfs,
        debtRepaymentPriority=debt_items,
        etfMessage=etf_list.message,
        etfSource=etf_list.source,
    )
