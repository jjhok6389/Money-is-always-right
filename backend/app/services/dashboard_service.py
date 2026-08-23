"""
Personalized dashboard engine.

Combines:
  - onboarding profile (income, expenses, propensity, goals)
  - Phase 2 transaction pipeline (monthly consumption mix)
  - Phase 2 product catalog (deposit/saving recommendations)

Outputs portfolio allocation, goal gap metrics, and an actionable roadmap.
"""

from __future__ import annotations

from calendar import monthrange
from datetime import datetime
from typing import Any, Optional

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
from app.services import etf_recommendation, fss_client, transaction_pipeline

# Fallback when profile has no explicit currentAssets.
DEFAULT_ASSET_MONTHS = 6

def _add_months(base: datetime, months: int) -> datetime:
    year = base.year + (base.month - 1 + months) // 12
    month = (base.month - 1 + months) % 12 + 1
    day = min(base.day, monthrange(year, month)[1])
    return base.replace(year=year, month=month, day=day)


# 위험 수용도가 높아질수록 현금·예금 비중을 낮추고 투자 비중을 높임. 각 행 합계 1.00.
PORTFOLIO_BY_PROPENSITY: dict[str, list[tuple[str, str, float]]] = {
    "stable": [
        ("cash", "현금·입출금", 0.25),
        ("deposit", "예금", 0.45),
        ("saving", "적금", 0.25),
        ("investment", "투자", 0.05),
    ],
    "stable_seeking": [
        ("cash", "현금·입출금", 0.22),
        ("deposit", "예금", 0.38),
        ("saving", "적금", 0.28),
        ("investment", "투자", 0.12),
    ],
    "neutral": [
        ("cash", "현금·입출금", 0.20),
        ("deposit", "예금", 0.30),
        ("saving", "적금", 0.30),
        ("investment", "투자", 0.20),
    ],
    "aggressive": [
        ("cash", "현금·입출금", 0.15),
        ("deposit", "예금", 0.20),
        ("saving", "적금", 0.30),
        ("investment", "투자", 0.35),
    ],
    "very_aggressive": [
        ("cash", "현금·입출금", 0.10),
        ("deposit", "예금", 0.10),
        ("saving", "적금", 0.20),
        ("investment", "투자", 0.60),
    ],
}


def _profile_from_document(doc: dict[str, Any] | None) -> ProfileSnapshot | None:
    if not doc:
        return None
    required = ("monthlyIncome", "fixedExpenses", "estimatedMonthlySavings", "targetAssetAmount", "targetYears")
    if any(doc.get(key) is None for key in required):
        return None
    return ProfileSnapshot(
        displayName=doc.get("displayName"),
        monthlyIncome=int(doc["monthlyIncome"]),
        fixedExpenses=int(doc["fixedExpenses"]),
        estimatedMonthlySavings=int(doc["estimatedMonthlySavings"]),
        investmentPropensity=doc.get("investmentPropensity") or "neutral",
        targetAssetAmount=int(doc["targetAssetAmount"]),
        targetYears=int(doc["targetYears"]),
        goalDescription=doc.get("goalDescription") or "",
        age=doc.get("age"),
        occupation=doc.get("occupation"),
    )


def _estimate_current_assets(profile: ProfileSnapshot, override: Optional[int]) -> int:
    if override is not None:
        return override
    # Conservative estimate: savings capacity accumulated over a few months.
    return max(profile.estimatedMonthlySavings, 0) * DEFAULT_ASSET_MONTHS


def _build_portfolio(current_assets: int, propensity: str) -> list[PortfolioSlice]:
    weights = PORTFOLIO_BY_PROPENSITY.get(propensity, PORTFOLIO_BY_PROPENSITY["neutral"])
    slices: list[PortfolioSlice] = []
    allocated = 0
    for index, (key, label, ratio) in enumerate(weights):
        if index == len(weights) - 1:
            amount = max(current_assets - allocated, 0)
        else:
            amount = int(round(current_assets * ratio))
            allocated += amount
        slices.append(
            PortfolioSlice(
                key=key,
                label=label,
                amount=amount,
                ratio=round((amount / current_assets) if current_assets else 0, 4),
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


def _debt_priorities(debt_balance: int, monthly_capacity: int) -> list[RoadmapItem]:
    if debt_balance <= 0:
        return [
            RoadmapItem(
                priority=1,
                title="현재 확인된 부채 없음",
                detail="고금리 부채가 생기면 저축보다 상환을 우선하세요.",
                category="debt",
            )
        ]

    months = (debt_balance + max(monthly_capacity, 1) - 1) // max(monthly_capacity, 1)
    return [
        RoadmapItem(
            priority=1,
            title="고금리 부채 우선 상환",
            detail=f"잔액 {debt_balance:,}원을 월 저축 여력의 70%로 나눌 경우 약 {max(int(months * 0.7), 1)}개월 내 감축을 권장합니다.",
            category="debt",
        ),
        RoadmapItem(
            priority=2,
            title="중금리 부채 리파이낸싱 검토",
            detail="금리가 낮은 상품으로 대환이 가능한지 비교하세요.",
            category="debt",
        ),
        RoadmapItem(
            priority=3,
            title="상환 후 저축 재개",
            detail="부채 비율이 안정되면 목표 자산 적립 비중을 다시 높이세요.",
            category="debt",
        ),
    ]


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
    # Surface the top debt action inside the main roadmap.
    if debt_items:
        items.append(
            RoadmapItem(
                priority=4,
                title=debt_items[0].title,
                detail=debt_items[0].detail,
                category="debt",
            )
        )
    if not goal.onTrack:
        items.insert(
            1,
            RoadmapItem(
                priority=1,
                title="목표 일정 조정 필요",
                detail=(
                    "현재 저축 속도로는 목표 기간 내 달성이 어렵습니다. "
                    "월 저축액을 늘리거나 목표 기간을 연장하는 방안을 검토하세요."
                ),
                category="savings",
            ),
        )
        # Re-number priorities
        for index, item in enumerate(items, start=1):
            item.priority = index
    return items


def _recommend_products(
    products: list,
    propensity: str,
) -> list[RecommendedProduct]:
    reason_by_propensity = {
        "stable": "원금 손실을 허용하지 않는 안정형 성향에 맞는 예금 중심 상품입니다.",
        "stable_seeking": "원금 손실을 최소화하려는 안정추구형에게 이자 수익이 안정적인 상품입니다.",
        "neutral": "수익과 안정의 균형을 찾는 위험중립형에게 중기 적립을 권장합니다.",
        "aggressive": "일정 손실을 감수하는 적극투자형이라면 우대금리가 높은 상품을 우선 검토하세요.",
        "very_aggressive": "공격투자형에게 예·적금은 안전자산 몫입니다. 목표 기간이 짧은 자금에만 배분하세요.",
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
    pipeline = transaction_pipeline.run_pipeline(user_id=user_id, month=month, count=45)

    # Blend stated savings capacity with observed cashflow from the dummy ledger.
    observed_net = max(int(pipeline.totals.get("netCashflow") or 0), 0)
    monthly_capacity = max(profile.estimatedMonthlySavings, observed_net // 2)

    current_assets = _estimate_current_assets(profile, request.currentAssets)
    debt_balance = request.debtBalance if request.debtBalance is not None else 0

    portfolio = _build_portfolio(current_assets, profile.investmentPropensity)
    consumption, consumption_totals = _build_consumption(pipeline)
    goal = _goal_progress(profile, current_assets, monthly_capacity)
    debt_items = _debt_priorities(debt_balance, monthly_capacity)
    roadmap = _roadmap(profile, goal, consumption_totals, debt_items)

    # Prefer savings for accumulation; mix deposit + annuity for longer-term goals.
    saving_resp = await fss_client.fetch_products("saving")
    deposit_resp = await fss_client.fetch_products("deposit")
    annuity_resp = await fss_client.fetch_products("annuity")
    mixed = (
        list(saving_resp.products[:3])
        + list(deposit_resp.products[:2])
        + list(annuity_resp.products[:2])
    )
    recommended = _recommend_products(mixed, profile.investmentPropensity)

    etf_list = await etf_recommendation.recommend_etfs(profile.investmentPropensity)

    return DashboardResponse(
        generatedAt=datetime.utcnow().isoformat() + "Z",
        month=month,
        portfolio=portfolio,
        consumption=consumption,
        consumptionTotals=consumption_totals,
        goal=goal,
        roadmap=roadmap,
        recommendedProducts=recommended,
        recommendedEtfs=etf_list.etfs,
        debtRepaymentPriority=debt_items,
        etfMessage=etf_list.message,
        etfSource=etf_list.source,
    )
