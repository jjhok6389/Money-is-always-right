"""
Dashboard response models for Phase 3 personalized analytics.
"""

from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.models.user import InvestmentPropensity
from app.models.etf import EtfSummary
from app.models.holdings import HoldingsSnapshot
from app.models.transaction import FinancialSummary


class ProfileSnapshot(BaseModel):
    displayName: Optional[str] = None
    # Legacy fields remain accepted, but analytics use generated FinancialSummary.
    monthlyIncome: int = Field(default=0, ge=0)
    fixedExpenses: int = Field(default=0, ge=0)
    estimatedMonthlySavings: int = Field(default=0, ge=0)
    investmentPropensity: InvestmentPropensity = "neutral"
    targetAssetAmount: int = Field(ge=0)
    targetYears: int = Field(ge=1, le=40)
    goalDescription: str = ""
    age: Optional[int] = None
    occupation: Optional[str] = None


class DashboardRequest(BaseModel):
    """Optional profile snapshot so the UI can compute even if backend sync lagged.

    Assets/debt come from holdings Demo (or later MyData), not request overrides.
    """
    profile: Optional[ProfileSnapshot] = None
    month: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}$")


class PortfolioSlice(BaseModel):
    key: str
    label: str
    amount: int
    ratio: float


class ConsumptionBar(BaseModel):
    category: str
    categoryLabel: str
    amount: int
    expenseType: Literal["fixed", "variable"]


class GoalProgress(BaseModel):
    currentAssets: int
    targetAssetAmount: int
    gapAmount: int
    achievementRate: float
    monthlySavingsCapacity: int
    estimatedMonthsToGoal: Optional[int]
    estimatedAchievementDate: Optional[str]
    onTrack: bool
    targetYears: int
    goalDescription: str


class RoadmapItem(BaseModel):
    priority: int
    title: str
    detail: str
    category: Literal["savings", "product", "debt", "spending"]


class RecommendedProduct(BaseModel):
    productType: Literal["deposit", "saving", "annuity"]
    companyName: str
    productName: str
    bestRate: Optional[float] = None
    bestTermMonths: Optional[int] = None
    reason: str


class DashboardResponse(BaseModel):
    generatedAt: str
    month: str
    portfolio: list[PortfolioSlice]
    consumption: list[ConsumptionBar]
    consumptionTotals: dict
    financialSummary: FinancialSummary
    holdings: HoldingsSnapshot
    goal: GoalProgress
    roadmap: list[RoadmapItem]
    recommendedProducts: list[RecommendedProduct]
    recommendedEtfs: list[EtfSummary] = Field(default_factory=list)
    debtRepaymentPriority: list[RoadmapItem]
    etfMessage: Optional[str] = None
    etfSource: Optional[Literal["krx", "mock"]] = None
