"""
ETF recommendation models (KRX daily series, separate from FSS products).
"""

from typing import Literal, Optional

from pydantic import BaseModel, Field


VolatilityBucket = Literal["ultra_low", "low_mid", "mid_high", "high"]
RiskLevel = Literal["low", "mid", "high"]


class EtfPricePoint(BaseModel):
    date: str  # YYYY-MM-DD
    close: float


class EtfSummary(BaseModel):
    symbol: str
    name: str
    volatility: float = Field(description="Annualized 60-session stdev of daily returns")
    volatilityPct: float = Field(description="annualized vol * 100 for UI (6-month window)")
    volatilityBucket: VolatilityBucket
    change6mPct: Optional[float] = Field(
        default=None,
        description="Kept for compatibility; value is 60-session change pct",
    )
    change60Pct: Optional[float] = None
    lastPrice: Optional[float] = None
    asOfDate: Optional[str] = None
    volPercentile: Optional[int] = Field(
        default=None,
        description="1-100; lower vol = lower percentile among universe",
    )
    universeSize: int = 15
    riskLevel: Optional[RiskLevel] = None
    riskLabel: Optional[str] = None
    reason: str


class EtfDetail(EtfSummary):
    series: list[EtfPricePoint] = Field(default_factory=list)
    disclaimer: str = "투자 권유 아님 · 과거 데이터 기반. 과거 변동 ≠ 미래 수익."


class EtfListResponse(BaseModel):
    source: Literal["krx", "mock"]
    propensity: str
    count: int
    etfs: list[EtfSummary]
    message: Optional[str] = None


class EtfDetailResponse(BaseModel):
    source: Literal["krx", "mock"]
    etf: EtfDetail
    message: Optional[str] = None


class EtfSyncResponse(BaseModel):
    source: Literal["krx", "mock"]
    count: int
    asOfDate: str
    message: str
    kbDir: Optional[str] = None
