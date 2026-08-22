"""
Digital twin simulation models for Phase 4.
"""

from typing import Any, Optional

from pydantic import BaseModel, Field


class SimulationAssumptions(BaseModel):
    monthlyIncome: int = Field(ge=0)
    monthlyExpenses: int = Field(ge=0)
    savingsRate: float = Field(ge=0, le=100, description="Surplus savings rate (%)")
    annualInterestRate: float = Field(ge=0, le=30, description="Expected annual yield (%)")
    currentAssets: int = Field(ge=0, default=0)
    horizonMonths: int = Field(ge=6, le=480, default=60)
    targetAssetAmount: int = Field(ge=0, default=0)


class SimulationRequest(BaseModel):
    baseline: SimulationAssumptions
    scenario: SimulationAssumptions
    label: Optional[str] = "맞춤 시나리오"


class TrajectoryPoint(BaseModel):
    monthIndex: int
    label: str
    baselineAssets: int
    scenarioAssets: int
    targetAssetAmount: int


class ScenarioSummary(BaseModel):
    monthlyDeposit: int
    finalAssets: int
    targetHitMonth: Optional[int]
    targetHitLabel: Optional[str]
    surplusVsBaseline: int


class SimulationResponse(BaseModel):
    generatedAt: str
    trajectory: list[TrajectoryPoint]
    baselineSummary: ScenarioSummary
    scenarioSummary: ScenarioSummary
    insights: list[str]


class ProfileSimulationRequest(BaseModel):
    profile: Optional[dict[str, Any]] = None
    scenario: dict[str, Any] = Field(default_factory=dict)
    currentAssets: Optional[int] = Field(default=None, ge=0)
    label: Optional[str] = "맞춤 시나리오"
