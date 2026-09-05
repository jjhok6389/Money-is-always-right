"""
Coaching report models — story scenes for the financial coach report UI.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.models.user import InvestmentPropensity


ReportType = Literal["initial", "monthly"]


class ConsumptionTopItem(BaseModel):
    category: str = ""
    categoryLabel: str
    amount: int = Field(ge=0)


class AllocationSplit(BaseModel):
    deposit: int = Field(ge=0)
    etf: int = Field(ge=0)


class TrajectorySnap(BaseModel):
    monthIndex: int
    label: str
    baselineAssets: int
    scenarioAssets: int
    targetAssetAmount: int


class ReportComparison(BaseModel):
    previousReportId: str
    previousCreatedAt: Optional[str] = None
    capacityDelta: int = 0
    monthsScenarioDelta: Optional[int] = None
    previousCapacity: int = 0
    previousMonthsScenario: Optional[int] = None
    previousMonthsScenarioLabel: Optional[str] = None
    previousTopCategoryLabel: Optional[str] = None
    previousTopCategoryAmount: Optional[int] = None
    summaryText: str = ""


class CoachingReport(BaseModel):
    reportId: str
    userId: str
    createdAt: str
    type: ReportType
    previousReportId: Optional[str] = None
    displayName: str = ""
    income: int = Field(ge=0)
    spend: int = Field(ge=0)
    capacity: int = Field(ge=0)
    currentAssets: int = Field(ge=0)
    targetAssets: int = Field(ge=0)
    targetYears: int = Field(ge=1)
    goalDescription: str = ""
    onTrack: bool = False
    monthsBaseline: Optional[int] = None
    monthsScenario: Optional[int] = None
    monthsBaselineLabel: Optional[str] = None
    monthsScenarioLabel: Optional[str] = None
    delta: int = Field(ge=0)
    insightText: str = ""
    allocation: AllocationSplit
    consumptionTop: list[ConsumptionTopItem] = Field(default_factory=list)
    hasLinkedConsumption: bool = True
    trajectory: list[TrajectorySnap] = Field(default_factory=list)
    baselineFinalAssets: int = 0
    scenarioFinalAssets: int = 0
    scenarioMonthlyDeposit: int = 0
    propensity: InvestmentPropensity = "neutral"
    roadmapWhy: list[str] = Field(default_factory=list)
    disclaimer: str = ""
    comparison: Optional[ReportComparison] = None


class CoachingReportSummary(BaseModel):
    reportId: str
    createdAt: str
    type: ReportType
    capacity: int
    targetAssets: int
    monthsScenarioLabel: Optional[str] = None
    insightText: str = ""


class GenerateReportRequest(BaseModel):
    type: ReportType = "initial"
    currentAssets: Optional[int] = Field(default=None, ge=0)
    profile: Optional[dict] = None


class ReportScheduleUpdate(BaseModel):
    monthlyReportDay: Optional[int] = Field(default=None, ge=1, le=28)


class ReportScheduleResponse(BaseModel):
    monthlyReportDay: Optional[int] = None
    # Stub: actual cron/push is out of scope for this MVP.
    scheduleNote: str = "지정한 날짜에 월간 리포트를 생성할 수 있습니다. 알림 발송은 추후 연동됩니다."
