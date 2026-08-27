"""API and persistence models for the personal financial roadmap."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from app.models.dashboard import ProfileSnapshot
from app.models.user import InvestmentPropensity

RoadmapStatus = Literal[
    "CURRENT",
    "PLANNED",
    "EXPECTED",
    "COMPLETED",
    "PARTIAL",
    "SKIPPED",
]
ActionType = Literal[
    "IMPROVE_CASH_FLOW",
    "AUTOMATE_CASH_FLOW",
    "REVIEW_DEBT",
    "AUTOMATE_DEBT_PAYMENT",
    "EXPAND_DEBT_REPAYMENT",
    "REDUCE_VARIABLE_SPENDING",
    "AUTOMATE_SAVING",
    "INCREASE_SAVING",
    "MAINTAIN_SAVING",
    "REVIEW_SAVING_PRODUCT",
    "REVIEW_ETF_INVESTMENT",
    "REVIEW_GOAL_PERIOD",
    "CHECK_EMERGENCY_FUND",
    "CHECK_PROGRESS",
]


class RoadmapPeriod(BaseModel):
    start: str
    end: str


class DataQuality(BaseModel):
    financialSource: Literal["mock", "live", "unknown"] = "unknown"
    currentAssetsEstimated: bool
    debtBalanceKnown: bool = False
    debtDetailAvailable: bool = False
    investmentSplitAvailable: bool = False
    warnings: list[str] = Field(default_factory=list)


class RoadmapGoal(BaseModel):
    targetAmount: int = Field(ge=0)
    targetYears: int = Field(ge=1)
    targetMonth: str
    goalDescription: str = ""


class ProjectedGap(BaseModel):
    currentAssetGap: int = Field(ge=0)
    baselineExpectedAmount: int = Field(ge=0)
    baselineShortfall: int = Field(ge=0)
    baselineTargetHitMonth: int | None = Field(default=None, ge=0)
    baselineTargetHitLabel: str | None = None


class ExpectedEffect(BaseModel):
    assumptionBased: bool = True
    baselineExpectedAmount: int | None = Field(default=None, ge=0)
    scenarioExpectedAmount: int | None = Field(default=None, ge=0)
    expectedAmountChange: int | None = None
    shortfallBefore: int | None = Field(default=None, ge=0)
    shortfallAfter: int | None = Field(default=None, ge=0)
    estimatedMonthsSaved: int | None = None


class CalculationBasis(BaseModel):
    calculator: str
    actionAmount: int | None = Field(default=None, ge=0)
    scenarioChanges: dict[str, int | float | str] = Field(default_factory=dict)
    annualInterestRate: float | None = Field(default=None, ge=0)
    horizonMonths: int | None = Field(default=None, ge=0)
    note: str = ""


class ExecutionMeans(BaseModel):
    type: Literal["PRODUCT", "ETF"]
    title: str
    identifier: str | None = None
    detail: str = ""


class RoadmapAction(BaseModel):
    actionType: ActionType
    title: str
    reason: str
    expectedEffect: ExpectedEffect | None = None
    basis: CalculationBasis | None = None
    executionMeans: list[ExecutionMeans] = Field(default_factory=list)
    calculationUnavailableReason: str | None = None
    investmentDisclaimer: str | None = None


class RoadmapMonth(BaseModel):
    month: str
    status: RoadmapStatus
    primaryAction: RoadmapAction
    secondaryAction: RoadmapAction | None = None


class LongTermSegment(BaseModel):
    startMonth: str
    endMonth: str
    type: Literal["MAINTAIN"] = "MAINTAIN"
    status: Literal["PROVISIONAL"] = "PROVISIONAL"
    title: str
    description: str


class RoadmapCheckpoint(BaseModel):
    month: str
    type: Literal["RECALCULATE", "TARGET_REVIEW"]
    status: Literal["CHECKPOINT"] = "CHECKPOINT"
    title: str
    description: str


class LongTermPlan(BaseModel):
    remainingMonths: int = Field(ge=0)
    planningMode: Literal["ROLLING"] = "ROLLING"
    recalculationIntervalMonths: int = Field(default=3, ge=1)
    provisional: bool = True
    targetReviewRequired: bool = False
    segments: list[LongTermSegment] = Field(default_factory=list)
    checkpoints: list[RoadmapCheckpoint] = Field(default_factory=list)


class PersonalRoadmap(BaseModel):
    roadmapId: str
    userId: str
    generatedAt: str
    period: RoadmapPeriod
    dataQuality: DataQuality
    goal: RoadmapGoal
    projectedGap: ProjectedGap
    investmentPropensity: InvestmentPropensity
    months: list[RoadmapMonth]
    # Optional only for documents created before the full-horizon roadmap release.
    longTermPlan: LongTermPlan | None = None


class PersonalRoadmapGenerateRequest(BaseModel):
    profile: ProfileSnapshot | None = None
    currentAssets: int | None = Field(default=None, ge=0)
    debtBalance: int | None = Field(default=None, ge=0)
    month: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}$")
    targetMonth: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}$")
    persist: bool = True

    @field_validator("month", "targetMonth")
    @classmethod
    def validate_month(cls, value: str | None) -> str | None:
        if value is None:
            return value
        year, month = map(int, value.split("-"))
        if year < 2000 or not 1 <= month <= 12:
            raise ValueError("month는 유효한 YYYY-MM 형식이어야 합니다.")
        return value


class RoadmapCoachSummary(BaseModel):
    currentAction: str
    currentReason: str
    expectedEffect: dict[str, Any] | None = None
    nextActions: list[str] = Field(default_factory=list)
    calculationBasis: str | None = None
    dataWarnings: list[str] = Field(default_factory=list)
