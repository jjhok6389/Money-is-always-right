"""Convert existing dashboard output into roadmap-specific state."""

from __future__ import annotations

from dataclasses import dataclass

from app.models.dashboard import DashboardResponse, ProfileSnapshot
from app.models.etf import EtfSummary
from app.models.transaction import FinancialSummary
from app.personal_roadmap.models import DataQuality


@dataclass(frozen=True)
class RoadmapFinancialState:
    month: str
    profile: ProfileSnapshot
    summary: FinancialSummary
    current_assets: int
    current_assets_estimated: bool
    debt_balance: int
    debt_balance_known: bool
    current_asset_gap: int
    goal_on_track: bool
    recommended_products: tuple[object, ...]
    recommended_etfs: tuple[EtfSummary, ...]
    consumption: tuple[object, ...]
    top_variable_category: str | None
    data_quality: DataQuality


def _data_quality(
    summary: FinancialSummary,
    current_assets_estimated: bool,
    debt_balance_known: bool,
) -> DataQuality:
    warnings: list[str] = []
    if summary.source == "mock":
        warnings.append("월간 금융데이터는 Demo 거래 기반입니다.")
    if current_assets_estimated:
        warnings.append("현재 자산은 월 저축 여력 기준 추정값입니다.")
    if not debt_balance_known:
        warnings.append("부채 잔액이 입력되지 않아 부채 보유 여부를 확정할 수 없습니다.")
    warnings.append("부채 금리·종류 정보가 없어 고금리 여부와 상환 효과를 계산할 수 없습니다.")
    warnings.append("저축과 투자 이체액이 분리되지 않아 투자 효과를 계산하지 않습니다.")
    return DataQuality(
        financialSource=summary.source,
        currentAssetsEstimated=current_assets_estimated,
        debtBalanceKnown=debt_balance_known,
        warnings=warnings,
    )


def from_dashboard(
    dashboard: DashboardResponse,
    *,
    profile: ProfileSnapshot,
    debt_balance: int,
    debt_balance_known: bool,
    current_assets_estimated: bool,
) -> RoadmapFinancialState:
    variable = [item for item in dashboard.consumption if item.expenseType == "variable"]
    top = max(variable, key=lambda item: item.amount, default=None)
    return RoadmapFinancialState(
        month=dashboard.month,
        profile=profile,
        summary=dashboard.financialSummary,
        current_assets=dashboard.goal.currentAssets,
        current_assets_estimated=current_assets_estimated,
        debt_balance=max(int(debt_balance), 0),
        debt_balance_known=debt_balance_known,
        current_asset_gap=dashboard.goal.gapAmount,
        goal_on_track=dashboard.goal.onTrack,
        recommended_products=tuple(dashboard.recommendedProducts),
        recommended_etfs=tuple(dashboard.recommendedEtfs),
        consumption=tuple(dashboard.consumption),
        top_variable_category=top.categoryLabel if top else None,
        data_quality=_data_quality(
            dashboard.financialSummary,
            current_assets_estimated,
            debt_balance_known,
        ),
    )
