"""
ETF ledger: Firestore when available, in-memory in demo mode.

Collections:
  etfMaster/{symbol}
  etfPrices/{symbol}   points[{date, close}]  (compact; last ~80 sessions)
  etfMetrics/{symbol}
  etfPolicy/current
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal, Optional

from app.services import firebase_service, krx_etf_client
from app.services.krx_etf_client import (
    MIN_POINTS,
    PRICE_KEEP_DAYS,
    TRADING_DAYS_60,
    PriceSeries,
    assign_buckets,
    compute_volatility,
    list_universe,
)

_memory_master: dict[str, dict[str, Any]] = {}
_memory_prices: dict[str, list[dict[str, Any]]] = {}
_memory_metrics: dict[str, dict[str, Any]] = {}
_memory_policy: dict[str, Any] = {}

POLICY_KO = {
    "stable": "안정형은 예·적금·연금 중심으로 운용합니다. ETF는 추천하지 않습니다.",
    "stable_seeking": "안정추구형은 초저변동 ETF를 1~2개만 참고용으로 보여 줍니다.",
    "neutral": "위험중립형은 유니버스 안에서 저~중 변동 구간의 ETF를 보여 줍니다.",
    "aggressive": "적극투자형은 중~고 변동 구간의 ETF를 탐색용으로 보여 줍니다.",
    "very_aggressive": "공격투자형은 고변동 구간의 ETF를 탐색용으로 보여 줍니다.",
    "disclaimer": (
        "투자 권유가 아닙니다. 6개월 변동성은 과거 일간 수익률의 연율화 표준편차이며 "
        "미래 수익을 보장하지 않습니다. 레버리지·인버스는 일간 배수를 추종하므로 "
        "장기 보유 시 손실이 커질 수 있습니다."
    ),
}

BUCKETS_BY_PROPENSITY: dict[str, set[str]] = {
    "stable": set(),
    "stable_seeking": {"ultra_low"},
    "neutral": {"low_mid"},
    "aggressive": {"mid_high"},
    "very_aggressive": {"high"},
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _db():
    firebase_service.init_firebase()
    if firebase_service.is_demo_mode():
        return None
    from firebase_admin import firestore

    return firestore.client()


def default_policy() -> dict[str, Any]:
    return {
        "bucketsByPropensity": {key: sorted(value) for key, value in BUCKETS_BY_PROPENSITY.items()},
        "messages": POLICY_KO,
        "windowTradingDays": TRADING_DAYS_60,
        "updatedAt": _now_iso(),
    }


def _write_memory_snapshot(
    series_list: list[PriceSeries],
    source: Literal["krx", "mock"],
    as_of: str,
) -> dict[str, dict[str, Any]]:
    eligible: dict[str, float] = {}
    stats_map: dict[str, Any] = {}
    for series in series_list:
        points = [
            {"date": day, "close": close}
            for day, close in zip(series.dates, series.closes)
        ][-PRICE_KEEP_DAYS:]
        _memory_prices[series.symbol] = points
        meta = krx_etf_client.lookup_meta(series.symbol)
        _memory_master[series.symbol] = {
            "symbol": series.symbol,
            "name": series.name,
            "assetClass": meta.get("assetClass"),
            "underlierName": meta.get("underlierName"),
            "oneLiner": meta.get("oneLiner"),
            "inUniverse": True,
        }
        stats = compute_volatility(series.closes)
        stats_map[series.symbol] = (series, stats, points)
        if len(series.closes) >= MIN_POINTS and stats.volatility_pct > 0:
            eligible[series.symbol] = stats.volatility

    buckets = assign_buckets(eligible)
    metrics: dict[str, dict[str, Any]] = {}
    for symbol, (series, stats, points) in stats_map.items():
        bucket = buckets.get(symbol)
        row = {
            "symbol": symbol,
            "name": series.name,
            "asOfDate": as_of,
            "vol60": stats.volatility,
            "vol60Pct": stats.volatility_pct,
            "change60Pct": stats.change_60_pct,
            "lastPrice": stats.last_price,
            "bucket": bucket,
            "eligible": bucket is not None,
            "source": source,
            "updatedAt": _now_iso(),
            "pointCount": len(points),
        }
        metrics[symbol] = row
        _memory_metrics[symbol] = row
    _memory_policy.update(default_policy())
    return metrics


def _write_firestore_snapshot(
    series_list: list[PriceSeries],
    source: Literal["krx", "mock"],
    as_of: str,
) -> dict[str, dict[str, Any]]:
    db = _db()
    assert db is not None
    metrics = _write_memory_snapshot(series_list, source, as_of)
    batch = db.batch()
    writes = 0

    def _flush() -> None:
        nonlocal batch, writes
        if writes:
            batch.commit()
            batch = db.batch()
            writes = 0

    for series in series_list:
        meta = krx_etf_client.lookup_meta(series.symbol)
        batch.set(
            db.collection("etfMaster").document(series.symbol),
            {
                "name": series.name,
                "assetClass": meta.get("assetClass"),
                "underlierName": meta.get("underlierName"),
                "oneLiner": meta.get("oneLiner"),
                "inUniverse": True,
            },
        )
        writes += 1
        points = _memory_prices[series.symbol]
        batch.set(
            db.collection("etfPrices").document(series.symbol),
            {"points": points, "collectedAt": _now_iso()},
        )
        writes += 1
        batch.set(db.collection("etfMetrics").document(series.symbol), metrics[series.symbol])
        writes += 1
        if writes >= 400:
            _flush()
    batch.set(db.collection("etfPolicy").document("current"), default_policy())
    writes += 1
    _flush()
    return metrics


def save_snapshot(
    series_list: list[PriceSeries],
    source: Literal["krx", "mock"],
) -> dict[str, dict[str, Any]]:
    as_of = date_today_iso()
    if _db() is None:
        return _write_memory_snapshot(series_list, source, as_of)
    return _write_firestore_snapshot(series_list, source, as_of)


def date_today_iso() -> str:
    from datetime import date

    return date.today().isoformat()


def list_metrics() -> list[dict[str, Any]]:
    _hydrate_from_firestore_if_needed()
    return list(_memory_metrics.values())


def get_metrics(symbol: str) -> dict[str, Any] | None:
    _hydrate_from_firestore_if_needed()
    return _memory_metrics.get(symbol)


def get_master(symbol: str) -> dict[str, Any] | None:
    _hydrate_from_firestore_if_needed()
    return _memory_master.get(symbol) or krx_etf_client.lookup_meta(symbol)


def get_price_series(symbol: str, last_n: int = TRADING_DAYS_60) -> PriceSeries | None:
    _hydrate_from_firestore_if_needed()
    points = _memory_prices.get(symbol) or []
    if not points:
        return None
    sliced = points[-last_n:]
    meta = get_master(symbol) or {}
    return PriceSeries(
        symbol=symbol,
        name=str(meta.get("name") or symbol),
        dates=[item["date"] for item in sliced],
        closes=[float(item["close"]) for item in sliced],
    )


def get_policy() -> dict[str, Any]:
    _hydrate_from_firestore_if_needed()
    return _memory_policy or default_policy()


def has_metrics() -> bool:
    _hydrate_from_firestore_if_needed()
    return bool(_memory_metrics)


def _hydrate_from_firestore_if_needed() -> None:
    if _memory_metrics:
        return
    db = _db()
    if db is None:
        return
    snaps = list(db.collection("etfMetrics").stream())
    if not snaps:
        return
    for snap in snaps:
        data = snap.to_dict() or {}
        data.setdefault("symbol", snap.id)
        _memory_metrics[snap.id] = data
    for snap in db.collection("etfMaster").stream():
        data = snap.to_dict() or {}
        data.setdefault("symbol", snap.id)
        _memory_master[snap.id] = data
    for snap in db.collection("etfPrices").stream():
        data = snap.to_dict() or {}
        _memory_prices[snap.id] = list(data.get("points") or [])
    policy_snap = db.collection("etfPolicy").document("current").get()
    if policy_snap.exists:
        _memory_policy.update(policy_snap.to_dict() or {})
    else:
        _memory_policy.update(default_policy())


async def ensure_seeded() -> str:
    """Fast path: seed mock metrics if the ledger is empty. No KRX loop."""
    if has_metrics():
        row = next(iter(_memory_metrics.values()))
        return str(row.get("source") or "mock")
    save_snapshot(krx_etf_client.mock_universe_series(), "mock")
    return "mock"
