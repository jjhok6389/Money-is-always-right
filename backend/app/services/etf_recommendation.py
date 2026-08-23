"""
Map investment propensity → filtered ETF summaries with Korean reasons.
"""

from __future__ import annotations

from typing import Optional

from app.models.etf import (
    EtfDetail,
    EtfDetailResponse,
    EtfListResponse,
    EtfPricePoint,
    EtfSummary,
)
from app.services import krx_etf_client

VALID_PROPENSITIES = {
    "stable",
    "stable_seeking",
    "neutral",
    "aggressive",
    "very_aggressive",
}

# stable* → no ETF list (cash/deposit focused)
# neutral → low volatility tercile
# aggressive → mid + high
# very_aggressive → high only
BUCKETS_BY_PROPENSITY: dict[str, set[str]] = {
    "stable": set(),
    "stable_seeking": set(),
    "neutral": {"low"},
    "aggressive": {"mid", "high"},
    "very_aggressive": {"high"},
}

REASON_BY_PROPENSITY = {
    "neutral": (
        "최근 6개월 일간 변동성이 동일 유니버스 대비 낮은 편이라 "
        "위험중립형 투자 비중에 맞습니다."
    ),
    "aggressive": (
        "변동성이 중간~높은 편이라 적극투자형 투자 버킷 탐색용입니다. "
        "과거 변동 ≠ 미래 수익."
    ),
    "very_aggressive": (
        "변동성이 높아 공격투자형 투자 버킷 탐색용입니다. "
        "과거 변동 ≠ 미래 수익."
    ),
}


def normalize_propensity(raw: str | None) -> str:
    value = (raw or "neutral").strip()
    if value not in VALID_PROPENSITIES:
        return "neutral"
    return value


def _reason_for(propensity: str, bucket: str) -> str:
    if propensity in REASON_BY_PROPENSITY:
        return REASON_BY_PROPENSITY[propensity]
    if bucket == "low":
        return REASON_BY_PROPENSITY["neutral"]
    if bucket == "high":
        return REASON_BY_PROPENSITY["very_aggressive"]
    return REASON_BY_PROPENSITY["aggressive"]


async def recommend_etfs(propensity: str | None) -> EtfListResponse:
    prop = normalize_propensity(propensity)
    allowed = BUCKETS_BY_PROPENSITY.get(prop, BUCKETS_BY_PROPENSITY["neutral"])

    if not allowed:
        return EtfListResponse(
            source="mock",
            propensity=prop,
            count=0,
            etfs=[],
            message="안정형·안정추구형은 예·적금 중심이라 ETF 추천을 생략합니다.",
        )

    series_list, source, message = await krx_etf_client.load_universe_series()
    vols: dict[str, float] = {}
    stats_by_symbol: dict[str, tuple] = {}
    for series in series_list:
        stats = krx_etf_client.compute_volatility(series.closes)
        vols[series.symbol] = stats.volatility
        stats_by_symbol[series.symbol] = (series, stats)

    buckets = krx_etf_client.assign_buckets(vols)
    summaries: list[EtfSummary] = []
    for symbol, (series, stats) in stats_by_symbol.items():
        bucket = buckets.get(symbol, "mid")
        if bucket not in allowed:
            continue
        summaries.append(
            EtfSummary(
                symbol=series.symbol,
                name=series.name,
                volatility=stats.volatility,
                volatilityPct=stats.volatility_pct,
                volatilityBucket=bucket,
                change6mPct=stats.change_6m_pct,
                lastPrice=stats.last_price,
                reason=_reason_for(prop, bucket),
            )
        )

    summaries.sort(key=lambda item: item.volatility)
    return EtfListResponse(
        source=source,
        propensity=prop,
        count=len(summaries),
        etfs=summaries,
        message=message,
    )


async def get_etf_detail(
    symbol: str,
    propensity: str | None = None,
) -> EtfDetailResponse:
    prop = normalize_propensity(propensity)
    series, source, message = await krx_etf_client.fetch_daily_prices(symbol)
    stats = krx_etf_client.compute_volatility(series.closes)

    # Bucket relative to full universe so the label stays consistent with lists.
    all_series, _, _ = await krx_etf_client.load_universe_series()
    vols = {
        item.symbol: krx_etf_client.compute_volatility(item.closes).volatility
        for item in all_series
    }
    if series.symbol not in vols:
        vols[series.symbol] = stats.volatility
    bucket = krx_etf_client.assign_buckets(vols).get(series.symbol, "mid")

    points = [
        EtfPricePoint(date=day, close=close)
        for day, close in zip(series.dates, series.closes)
    ]
    detail = EtfDetail(
        symbol=series.symbol,
        name=series.name,
        volatility=stats.volatility,
        volatilityPct=stats.volatility_pct,
        volatilityBucket=bucket,
        change6mPct=stats.change_6m_pct,
        lastPrice=stats.last_price,
        reason=_reason_for(prop, bucket),
        series=points,
    )
    return EtfDetailResponse(source=source, etf=detail, message=message)
