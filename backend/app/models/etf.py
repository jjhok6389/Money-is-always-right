"""
ETF recommendation models (KRX daily series, separate from FSS products).
"""

from typing import Literal, Optional

from pydantic import BaseModel, Field


VolatilityBucket = Literal["low", "mid", "high"]


class EtfPricePoint(BaseModel):
    date: str  # YYYY-MM-DD
    close: float


class EtfSummary(BaseModel):
    symbol: str
    name: str
    volatility: float = Field(description="Annualized stdev of daily returns (decimal, e.g. 0.12)")
    volatilityPct: float = Field(description="volatility * 100 for UI")
    volatilityBucket: VolatilityBucket
    change6mPct: Optional[float] = None
    lastPrice: Optional[float] = None
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
