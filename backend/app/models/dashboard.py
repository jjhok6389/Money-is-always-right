"""
Dashboard response models for Phase 3 personalized analytics.
"""

from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.models.user import InvestmentPropensity
from app.models.etf import EtfSummary


class ProfileSnapshot(BaseModel):
    displayName: Optional[str] = None
    monthlyIncome: int = Field(ge=0)
    fixedExpenses: int = Field(ge=0)
    estimatedMonthlySavings: int = Field(ge=0)
    investmentPropensity: InvestmentPropensity = "neutral"
    targetAssetAmount: int = Field(ge=0)
    targetYears: int = Field(ge=1, le=40)
    goalDescription: str = ""
    age: Optional[int] = None
    occupation: Optional[str] = None


class DashboardRequest(BaseModel):
    """Optional overrides so the UI can compute even if backend profile sync lagged."""
    profile: Optional[ProfileSnapshot] = None
    currentAssets: Optional[int] = Field(default=None, ge=0)
    debtBalance: Optional[int] = Field(default=None, ge=0)
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
    goal: GoalProgress
    roadmap: list[RoadmapItem]
    recommendedProducts: list[RecommendedProduct]
    recommendedEtfs: list[EtfSummary] = Field(default_factory=list)
    debtRepaymentPriority: list[RoadmapItem]
    etfMessage: Optional[str] = None
    etfSource: Optional[Literal["krx", "mock"]] = None
