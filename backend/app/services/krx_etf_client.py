"""
KRX ETF daily trading client + volatility helpers.

API (when KRX_AUTH_KEY is set):
  POST/GET https://data-dbg.krx.co.kr/svc/apis/etp/etf_bydd_trd
  Header: AUTH_KEY
  Query/body: basDd=YYYYMMDD
  Docs: https://openapi.krx.co.kr/ (ETF 일별매매정보)

Volatility definition (single source of truth):
  - Use ~126 trading days (~6 months) of daily close prices.
  - Compute daily simple returns r_t = P_t / P_{t-1} - 1.
  - volatility = stdev(r) * sqrt(252)  # annualized; UI label is still "6개월 변동성".
  - If fewer closes exist, use whatever length is available (>= 5).

When the key is missing or a remote call fails, a deterministic mock universe
with synthetic prices is returned so demos keep working.
"""

from __future__ import annotations

import math
import statistics
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any, Literal, Optional

import httpx

from app.config import get_settings

# In-memory cache: key -> (expires_at_epoch, payload)
_CACHE: dict[str, tuple[float, Any]] = {}
_CACHE_TTL_SEC = 12 * 60 * 60  # 12h

TRADING_DAYS_6M = 126
MIN_POINTS = 5

# Fixed representative ETF universe (KOSPI ETF codes).
# volHint drives mock price noise; real KRX data overrides the ranking.
ETF_UNIVERSE: list[dict[str, Any]] = [
    {"symbol": "153130", "name": "KODEX 단기채권", "volHint": 0.003},
    {"symbol": "148070", "name": "KODEX 국고채10년", "volHint": 0.005},
    {"symbol": "273130", "name": "KODEX 종합채권(AA-이상)액티브", "volHint": 0.004},
    {"symbol": "114260", "name": "KODEX 국고채3년", "volHint": 0.0035},
    {"symbol": "069500", "name": "KODEX 200", "volHint": 0.011},
    {"symbol": "102110", "name": "TIGER 200", "volHint": 0.011},
    {"symbol": "278530", "name": "KODEX 200TR", "volHint": 0.011},
    {"symbol": "379800", "name": "KODEX 미국S&P500TR", "volHint": 0.012},
    {"symbol": "360750", "name": "TIGER 미국S&P500", "volHint": 0.012},
    {"symbol": "133690", "name": "TIGER 미국나스닥100", "volHint": 0.015},
    {"symbol": "251350", "name": "KODEX 고배당주", "volHint": 0.013},
    {"symbol": "229200", "name": "KODEX 코스닥150", "volHint": 0.018},
    {"symbol": "091160", "name": "KODEX 반도체", "volHint": 0.022},
    {"symbol": "122630", "name": "KODEX 레버리지", "volHint": 0.028},
    {"symbol": "252670", "name": "KODEX 200선물인버스2X", "volHint": 0.030},
]

VolatilityBucket = Literal["low", "mid", "high"]


@dataclass
class PriceSeries:
    symbol: str
    name: str
    dates: list[str]  # YYYY-MM-DD
    closes: list[float]


@dataclass
class VolatilityStats:
    volatility: float
    volatility_pct: float
    change_6m_pct: Optional[float]
    last_price: Optional[float]
    returns: list[float]


def _cache_get(key: str) -> Any | None:
    entry = _CACHE.get(key)
    if not entry:
        return None
    expires, value = entry
    if time.time() > expires:
        _CACHE.pop(key, None)
        return None
    return value


def _cache_set(key: str, value: Any) -> None:
    _CACHE[key] = (time.time() + _CACHE_TTL_SEC, value)


def list_universe() -> list[dict[str, str]]:
    return [{"symbol": item["symbol"], "name": item["name"]} for item in ETF_UNIVERSE]


def _lookup_meta(symbol: str) -> dict[str, Any]:
    for item in ETF_UNIVERSE:
        if item["symbol"] == symbol:
            return item
    return {"symbol": symbol, "name": symbol, "volHint": 0.012}


def compute_volatility(closes: list[float]) -> VolatilityStats:
    if len(closes) < MIN_POINTS:
        return VolatilityStats(
            volatility=0.0,
            volatility_pct=0.0,
            change_6m_pct=None,
            last_price=closes[-1] if closes else None,
            returns=[],
        )

    returns: list[float] = []
    for index in range(1, len(closes)):
        prev = closes[index - 1]
        if prev <= 0:
            continue
        returns.append(closes[index] / prev - 1.0)

    if len(returns) < 2:
        last = closes[-1]
        first = closes[0]
        change = ((last / first) - 1.0) * 100 if first else None
        return VolatilityStats(
            volatility=0.0,
            volatility_pct=0.0,
            change_6m_pct=round(change, 2) if change is not None else None,
            last_price=last,
            returns=returns,
        )

    # Annualized stdev of daily returns (see module docstring).
    daily_std = statistics.stdev(returns)
    annualized = daily_std * math.sqrt(252)
    first = closes[0]
    last = closes[-1]
    change = ((last / first) - 1.0) * 100 if first else None
    return VolatilityStats(
        volatility=round(annualized, 6),
        volatility_pct=round(annualized * 100, 2),
        change_6m_pct=round(change, 2) if change is not None else None,
        last_price=round(last, 2),
        returns=returns,
    )


def assign_buckets(vols: dict[str, float]) -> dict[str, VolatilityBucket]:
    """Tercile buckets within the current universe (adjustable via sorting only)."""
    if not vols:
        return {}
    ordered = sorted(vols.items(), key=lambda item: item[1])
    n = len(ordered)
    low_end = max(n // 3, 1)
    high_start = n - max(n // 3, 1)
    buckets: dict[str, VolatilityBucket] = {}
    for index, (symbol, _) in enumerate(ordered):
        if index < low_end:
            buckets[symbol] = "low"
        elif index >= high_start:
            buckets[symbol] = "high"
        else:
            buckets[symbol] = "mid"
    return buckets


def _weekday_dates_back(count: int, end: date | None = None) -> list[date]:
    """Approximate trading days by skipping weekends (holidays ignored)."""
    cursor = end or date.today() - timedelta(days=1)
    days: list[date] = []
    while len(days) < count:
        if cursor.weekday() < 5:
            days.append(cursor)
        cursor -= timedelta(days=1)
    days.reverse()
    return days


def _mock_series(symbol: str, name: str, vol_hint: float) -> PriceSeries:
    days = _weekday_dates_back(TRADING_DAYS_6M)
    # Deterministic seed from symbol digits.
    seed = sum(ord(ch) for ch in symbol) * 17 + 101
    state = seed % 2147483647
    price = 10_000.0 + (seed % 5000)

    def _rand() -> float:
        nonlocal state
        state = (state * 48271) % 2147483647
        return state / 2147483647

    dates: list[str] = []
    closes: list[float] = []
    for day in days:
        # Box-Muller-ish noise from two uniforms.
        u1 = max(_rand(), 1e-9)
        u2 = _rand()
        noise = math.sqrt(-2.0 * math.log(u1)) * math.cos(2 * math.pi * u2)
        ret = 0.00015 + vol_hint * noise
        price = max(price * (1.0 + ret), 100.0)
        dates.append(day.isoformat())
        closes.append(round(price, 2))
    return PriceSeries(symbol=symbol, name=name, dates=dates, closes=closes)


def _parse_close(row: dict[str, Any]) -> float | None:
    for key in ("TDD_CLSPRC", "tddClsprc", "CLSPRC", "close"):
        raw = row.get(key)
        if raw is None or raw == "":
            continue
        try:
            return float(str(raw).replace(",", ""))
        except ValueError:
            continue
    return None


def _parse_symbol(row: dict[str, Any]) -> str:
    for key in ("ISU_CD", "isuCd", "ISU_SRT_CD", "srtnCd"):
        value = row.get(key)
        if value:
            return str(value).strip()
    return ""


async def _fetch_krx_day(bas_dd: str, auth_key: str, base_url: str) -> list[dict[str, Any]]:
    cache_key = f"krx-day:{bas_dd}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    url = f"{base_url.rstrip('/')}/etp/etf_bydd_trd"
    headers = {"AUTH_KEY": auth_key.strip(), "Accept": "application/json"}
    params = {"basDd": bas_dd}

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Prefer GET (common in samples); fall back to POST JSON if needed.
        response = await client.get(url, headers=headers, params=params)
        if response.status_code >= 400:
            response = await client.post(
                url,
                headers={**headers, "Content-Type": "application/json"},
                json=params,
            )
        response.raise_for_status()
        payload = response.json()

    rows = payload.get("OutBlock_1") or payload.get("outBlock1") or payload.get("data") or []
    if not isinstance(rows, list):
        rows = []
    _cache_set(cache_key, rows)
    return rows


async def fetch_daily_prices(
    symbol: str,
    start: date | None = None,
    end: date | None = None,
) -> tuple[PriceSeries, Literal["krx", "mock"], Optional[str]]:
    """
    Return close series for one ETF.
    Always succeeds: falls back to mock on missing key / HTTP errors.
    """
    meta = _lookup_meta(symbol)
    settings = get_settings()
    auth_key = (settings.krx_auth_key or "").strip()
    if not auth_key:
        series = _mock_series(symbol, meta["name"], float(meta["volHint"]))
        return series, "mock", "KRX_AUTH_KEY가 없어 모의 ETF 시계열을 반환했습니다."

    end_day = end or (date.today() - timedelta(days=1))
    start_day = start or (end_day - timedelta(days=220))
    wanted = {item["symbol"] for item in ETF_UNIVERSE}
    if symbol not in wanted and symbol != meta["symbol"]:
        wanted.add(symbol)

    # Build series by walking weekdays; skip empty holiday responses.
    closes_by_day: dict[str, float] = {}
    cursor = start_day
    try:
        while cursor <= end_day:
            if cursor.weekday() < 5:
                bas = cursor.strftime("%Y%m%d")
                rows = await _fetch_krx_day(bas, auth_key, settings.krx_base_url)
                for row in rows:
                    code = _parse_symbol(row)
                    if code != symbol:
                        continue
                    close = _parse_close(row)
                    if close is not None:
                        closes_by_day[cursor.isoformat()] = close
                        break
            cursor += timedelta(days=1)
    except Exception as exc:
        series = _mock_series(symbol, meta["name"], float(meta["volHint"]))
        return series, "mock", f"금감원/KRX 호출 실패로 모의 데이터를 사용합니다. ({exc})"

    if len(closes_by_day) < MIN_POINTS:
        series = _mock_series(symbol, meta["name"], float(meta["volHint"]))
        return series, "mock", "KRX 일별 데이터가 부족해 모의 시계열로 대체했습니다."

    # Keep the most recent ~126 points.
    ordered_dates = sorted(closes_by_day.keys())[-TRADING_DAYS_6M:]
    series = PriceSeries(
        symbol=symbol,
        name=meta["name"],
        dates=ordered_dates,
        closes=[closes_by_day[d] for d in ordered_dates],
    )
    return series, "krx", None


async def load_universe_series() -> tuple[list[PriceSeries], Literal["krx", "mock"], Optional[str]]:
    """
    Load price series for the whole fixed universe.
    Without a key, all mock. With a key, fetch day boards once per date and slice.
    """
    settings = get_settings()
    auth_key = (settings.krx_auth_key or "").strip()
    if not auth_key:
        series_list = [
            _mock_series(item["symbol"], item["name"], float(item["volHint"]))
            for item in ETF_UNIVERSE
        ]
        return series_list, "mock", "KRX_AUTH_KEY가 없어 모의 ETF 유니버스를 반환했습니다."

    cache_key = "krx-universe-series-v1"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    days = _weekday_dates_back(TRADING_DAYS_6M + 40)
    wanted = {item["symbol"]: item["name"] for item in ETF_UNIVERSE}
    buckets: dict[str, dict[str, float]] = {symbol: {} for symbol in wanted}

    try:
        for day in days:
            bas = day.strftime("%Y%m%d")
            rows = await _fetch_krx_day(bas, auth_key, settings.krx_base_url)
            iso = day.isoformat()
            for row in rows:
                code = _parse_symbol(row)
                if code not in buckets:
                    continue
                close = _parse_close(row)
                if close is not None:
                    buckets[code][iso] = close
    except Exception as exc:
        series_list = [
            _mock_series(item["symbol"], item["name"], float(item["volHint"]))
            for item in ETF_UNIVERSE
        ]
        return series_list, "mock", f"KRX 호출 실패로 모의 데이터를 사용합니다. ({exc})"

    series_list: list[PriceSeries] = []
    for symbol, name in wanted.items():
        day_map = buckets.get(symbol) or {}
        if len(day_map) < MIN_POINTS:
            meta = _lookup_meta(symbol)
            series_list.append(_mock_series(symbol, name, float(meta["volHint"])))
            continue
        ordered = sorted(day_map.keys())[-TRADING_DAYS_6M:]
        series_list.append(
            PriceSeries(
                symbol=symbol,
                name=name,
                dates=ordered,
                closes=[day_map[d] for d in ordered],
            )
        )

    result = (series_list, "krx", None)
    _cache_set(cache_key, result)
    return result
