"""
ETF recommendation from the persisted metrics ledger (no KRX on the request path).
"""

from __future__ import annotations

import asyncio

from app.models.etf import (
    EtfDetail,
    EtfDetailResponse,
    EtfDividendPoint,
    EtfListResponse,
    EtfPricePoint,
    EtfSummary,
    RiskLevel,
)
from app.services import etf_store, krx_etf_client
from app.services.etf_history import fetch_etf_history
from app.services.etf_store import BUCKETS_BY_PROPENSITY, POLICY_KO

VALID_PROPENSITIES = {
    "stable",
    "stable_seeking",
    "neutral",
    "aggressive",
    "very_aggressive",
}

RISK_LEVEL_BY_BUCKET = {
    "ultra_low": "low",
    "low_mid": "low",
    "mid_high": "mid",
    "high": "high",
}

RISK_LABEL = {
    "low": "🟢 저변동 상품",
    "mid": "🟡 중변동 상품",
    "high": "🔴 고변동 상품",
}


def normalize_propensity(raw: str | None) -> str:
    value = (raw or "neutral").strip()
    if value not in VALID_PROPENSITIES:
        return "neutral"
    return value


def _risk_level(bucket: str) -> RiskLevel:
    return RISK_LEVEL_BY_BUCKET.get(bucket, "mid")  # type: ignore[return-value]


def _percentiles(rows: list[dict]) -> dict[str, int]:
    ranked = [
        row
        for row in rows
        if row.get("eligible") and row.get("vol60") is not None
    ]
    ordered = sorted(
        ranked,
        key=lambda row: (float(row.get("vol60") or 0), str(row.get("symbol") or "")),
    )
    n = len(ordered) or 1
    return {
        str(row["symbol"]): max(1, round((index + 1) / n * 100))
        for index, row in enumerate(ordered)
    }


def _card_reason(vol_pct: float, percentile: int, universe_size: int, risk_level: str) -> str:
    label = RISK_LABEL.get(risk_level, RISK_LABEL["mid"])
    return (
        f"최근 6개월 변동성 {vol_pct:.1f}%\n"
        f"유니버스 {universe_size}종 중 변동성 하위 {percentile}%\n"
        f"{label}"
    )


def _source_from_rows(rows: list[dict]) -> str:
    if any(row.get("source") == "krx" for row in rows):
        return "krx"
    return "mock"


def _universe_size() -> int:
    return len(krx_etf_client.list_universe())


def _to_summary(row: dict, percentiles: dict[str, int], universe_size: int) -> EtfSummary:
    bucket = row.get("bucket") or "low_mid"
    change = row.get("change60Pct")
    vol_pct = float(row.get("vol60Pct") or 0)
    percentile = percentiles.get(str(row["symbol"]), 50)
    risk = _risk_level(bucket)
    return EtfSummary(
        symbol=row["symbol"],
        name=row.get("name") or row["symbol"],
        volatility=float(row.get("vol60") or 0),
        volatilityPct=vol_pct,
        volatilityBucket=bucket,
        change6mPct=change,
        change60Pct=change,
        lastPrice=row.get("lastPrice"),
        asOfDate=row.get("asOfDate"),
        volPercentile=percentile,
        universeSize=universe_size,
        riskLevel=risk,
        riskLabel=RISK_LABEL[risk],
        reason=_card_reason(vol_pct, percentile, universe_size, risk),
    )


def _price_points(dates: list[str], closes: list[float]) -> list[EtfPricePoint]:
    window = krx_etf_client.TRADING_DAYS_WINDOW
    return [
        EtfPricePoint(date=day, close=close)
        for day, close in zip(dates[-window:], closes[-window:])
    ]


async def recommend_etfs(propensity: str | None) -> EtfListResponse:
    await etf_store.ensure_seeded()
    prop = normalize_propensity(propensity)
    allowed = BUCKETS_BY_PROPENSITY.get(prop, BUCKETS_BY_PROPENSITY["neutral"])
    rows = etf_store.list_metrics()
    source = _source_from_rows(rows)
    universe_size = _universe_size()
    percentiles = _percentiles(rows)

    if prop == "stable" or not allowed:
        return EtfListResponse(
            source=source,
            propensity=prop,
            count=0,
            etfs=[],
            message=POLICY_KO["stable"],
        )

    picked: list[EtfSummary] = []
    for row in rows:
        if not row.get("eligible") or row.get("bucket") not in allowed:
            continue
        picked.append(_to_summary(row, percentiles, universe_size))

    picked.sort(key=lambda item: item.volatility)
    if prop == "stable_seeking":
        picked = picked[:2]

    return EtfListResponse(
        source=source,
        propensity=prop,
        count=len(picked),
        etfs=picked,
        message=POLICY_KO.get(prop),
    )


async def _get_stored_etf_detail(symbol: str, propensity: str | None) -> EtfDetailResponse:
    await etf_store.ensure_seeded()
    normalize_propensity(propensity)
    code = symbol.strip()
    row = etf_store.get_metrics(code)
    series = etf_store.get_price_series(code, last_n=krx_etf_client.TRADING_DAYS_WINDOW)
    rows = etf_store.list_metrics()
    percentiles = _percentiles(rows)
    universe_size = _universe_size()
    if row is None:
        meta = krx_etf_client.lookup_meta(code)
        mock = krx_etf_client.mock_series(code)
        stats = krx_etf_client.compute_volatility(mock.closes)
        fallback = {
            "symbol": code,
            "name": str(meta.get("name") or code),
            "vol60": stats.volatility,
            "vol60Pct": stats.volatility_pct,
            "bucket": "low_mid",
            "change60Pct": stats.change_60_pct,
            "lastPrice": stats.last_price,
            "asOfDate": None,
        }
        summary = _to_summary(fallback, percentiles, universe_size)
        detail = EtfDetail(**summary.model_dump(), series=_price_points(mock.dates, mock.closes))
        return EtfDetailResponse(
            source="mock",
            etf=detail,
            message="저장된 지표가 없어 모의 시계열을 사용했습니다.",
        )

    if series is None:
        series = krx_etf_client.mock_series(code, row.get("name"))
    summary = _to_summary(row, percentiles, universe_size)
    detail = EtfDetail(**summary.model_dump(), series=_price_points(series.dates, series.closes))
    return EtfDetailResponse(source=row.get("source") or "mock", etf=detail)


async def get_etf_detail(
    symbol: str,
    propensity: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> EtfDetailResponse:
    stored = await _get_stored_etf_detail(symbol, propensity)
    if not start_date:
        return stored
    try:
        history = await asyncio.to_thread(fetch_etf_history, symbol.strip(), start_date, end_date)
    except Exception:
        stored.message = "실시간 조회에 실패해 기존 저장 시계열을 사용했습니다. 배당 내역은 제공되지 않습니다."
        return stored

    stored.source = "yfinance"
    stored.etf.series = [EtfPricePoint(**point) for point in history["prices"]]
    stored.etf.dividends = [EtfDividendPoint(**point) for point in history["dividends"]]
    stored.etf.asOfDate = history["asOfDate"]
    stored.etf.lastPrice = stored.etf.series[-1].close
    stored.message = None
    return stored
