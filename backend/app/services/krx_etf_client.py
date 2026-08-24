"""
KRX ETF daily client + 6-month volatility helpers.

API (Spec.docx — ETF 일별매매정보):
  POST https://data-dbg.krx.co.kr/svc/apis/etp/etf_bydd_trd
  Header: AUTH_KEY
  Body: {"basDd":"YYYYMMDD"}
  Response: OutBlock_1[].TDD_CLSPRC / ISU_CD / ISU_NM

Volatility (single source of truth):
  - Window = last ~126 trading-day closes (~6 months; not calendar 180 days).
  - r_t = P_t / P_{t-1} - 1
  - vol = stdev(r) * sqrt(252)  # annualized; UI label is 「6개월 변동성」
  - Fewer than MIN_POINTS closes → exclude from recommendations.

This module must NOT be called from dashboard/recommend request paths.
KRX I/O lives in the sync job only. A 401 aborts immediately (no day-by-day retry).
"""

from __future__ import annotations

import math
import statistics
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any, Literal, Optional

import httpx

from app.config import get_settings

# ~6 calendar months of sessions (252/2). Keep extra days for holidays/gaps.
TRADING_DAYS_WINDOW = 126
TRADING_DAYS_60 = TRADING_DAYS_WINDOW  # alias; window is 6 months
PRICE_KEEP_DAYS = 160
MIN_POINTS = 5

_KRX_AUTH_HINT = (
    "KRX가 인증을 거부했습니다. 인증키 발급과 별도로 "
    "openapi.krx.co.kr → 서비스 이용 → 증권상품에서 "
    "‘ETF 일별매매정보’를 이용신청하고, 마이페이지 이용현황이 승인된 뒤 "
    "POST /api/etf/sync 를 다시 실행하세요. 승인 전까지는 모의 데이터를 사용합니다."
)

# Fixed representative universe (~15). Do not expand to all listed ETFs.
ETF_UNIVERSE: list[dict[str, Any]] = [
    {
        "symbol": "153130",
        "name": "KODEX 단기채권",
        "volHint": 0.003,
        "assetClass": "bond",
        "underlierName": "단기 채권",
        "oneLiner": "만기가 짧은 채권에 투자해 가격 변동이 작은 편인 ETF입니다.",
    },
    {
        "symbol": "148070",
        "name": "KODEX 국고채10년",
        "volHint": 0.005,
        "assetClass": "bond",
        "underlierName": "국고채 10년",
        "oneLiner": "장기 국고채 금리가 변하면 가격이 움직이는 채권형 ETF입니다.",
    },
    {
        "symbol": "273130",
        "name": "KODEX 종합채권(AA-이상)액티브",
        "volHint": 0.004,
        "assetClass": "bond",
        "underlierName": "AA- 이상 종합채권",
        "oneLiner": "우량 등급 채권을 담는 액티브 채권형 ETF입니다.",
    },
    {
        "symbol": "114260",
        "name": "KODEX 국고채3년",
        "volHint": 0.0035,
        "assetClass": "bond",
        "underlierName": "국고채 3년",
        "oneLiner": "중기 국고채를 추종해 단기채보다 조금 더 금리를 노리는 ETF입니다.",
    },
    {
        "symbol": "069500",
        "name": "KODEX 200",
        "volHint": 0.011,
        "assetClass": "equity_kr",
        "underlierName": "KOSPI 200",
        "oneLiner": "국내 대형주 200종목을 한 바구니에 담은 대표 지수 ETF입니다.",
    },
    {
        "symbol": "102110",
        "name": "TIGER 200",
        "volHint": 0.011,
        "assetClass": "equity_kr",
        "underlierName": "KOSPI 200",
        "oneLiner": "KOSPI 200을 따르는 또 다른 국내 대형주 ETF입니다.",
    },
    {
        "symbol": "278530",
        "name": "KODEX 200TR",
        "volHint": 0.011,
        "assetClass": "equity_kr",
        "underlierName": "KOSPI 200 Total Return",
        "oneLiner": "배당을 재투자한 KOSPI 200 총수익 지수를 따릅니다.",
    },
    {
        "symbol": "379800",
        "name": "KODEX 미국S&P500TR",
        "volHint": 0.012,
        "assetClass": "equity_us",
        "underlierName": "S&P 500 Total Return",
        "oneLiner": "미국 대표 500기업의 총수익을 원화로 추종합니다.",
    },
    {
        "symbol": "360750",
        "name": "TIGER 미국S&P500",
        "volHint": 0.012,
        "assetClass": "equity_us",
        "underlierName": "S&P 500",
        "oneLiner": "미국 S&P 500 지수를 따르는 해외주식형 ETF입니다.",
    },
    {
        "symbol": "133690",
        "name": "TIGER 미국나스닥100",
        "volHint": 0.015,
        "assetClass": "equity_us",
        "underlierName": "NASDAQ 100",
        "oneLiner": "미국 나스닥 대형 기술주에 분산 투자하는 ETF입니다.",
    },
    {
        "symbol": "251350",
        "name": "KODEX 고배당주",
        "volHint": 0.013,
        "assetClass": "equity_kr",
        "underlierName": "고배당 주식",
        "oneLiner": "배당 수익률이 높은 국내 주식에 투자합니다.",
    },
    {
        "symbol": "229200",
        "name": "KODEX 코스닥150",
        "volHint": 0.018,
        "assetClass": "equity_kr",
        "underlierName": "KOSDAQ 150",
        "oneLiner": "코스닥 대표 150종목이라 대형주보다 출렁임이 큰 편입니다.",
    },
    {
        "symbol": "091160",
        "name": "KODEX 반도체",
        "volHint": 0.022,
        "assetClass": "equity_theme",
        "underlierName": "국내 반도체",
        "oneLiner": "국내 반도체 업종에 집중해 테마 변동성이 큽니다.",
    },
    {
        "symbol": "122630",
        "name": "KODEX 레버리지",
        "volHint": 0.028,
        "assetClass": "leverage",
        "underlierName": "KOSPI 200 2X",
        "oneLiner": "지수 일간 수익의 약 2배를 추종합니다. 장기 보유 시 손실이 커질 수 있습니다.",
    },
    {
        "symbol": "252670",
        "name": "KODEX 200선물인버스2X",
        "volHint": 0.030,
        "assetClass": "inverse",
        "underlierName": "KOSPI 200 -2X",
        "oneLiner": "지수가 내리면 수익, 오르면 손실이 약 2배로 나타납니다.",
    },
]

VolatilityBucket = Literal["ultra_low", "low_mid", "mid_high", "high"]
BUCKET_ORDER: tuple[VolatilityBucket, ...] = ("ultra_low", "low_mid", "mid_high", "high")


@dataclass
class PriceSeries:
    symbol: str
    name: str
    dates: list[str]
    closes: list[float]


@dataclass
class VolatilityStats:
    volatility: float
    volatility_pct: float
    change_60_pct: Optional[float]
    last_price: Optional[float]
    returns: list[float]


def list_universe() -> list[dict[str, Any]]:
    return [dict(item) for item in ETF_UNIVERSE]


def lookup_meta(symbol: str) -> dict[str, Any]:
    for item in ETF_UNIVERSE:
        if item["symbol"] == symbol:
            return dict(item)
    return {
        "symbol": symbol,
        "name": symbol,
        "volHint": 0.012,
        "assetClass": "unknown",
        "underlierName": "",
        "oneLiner": "",
    }


def weekday_dates_back(count: int, end: date | None = None) -> list[date]:
    cursor = end or (date.today() - timedelta(days=1))
    days: list[date] = []
    while len(days) < count:
        if cursor.weekday() < 5:
            days.append(cursor)
        cursor -= timedelta(days=1)
    days.reverse()
    return days


def compute_volatility(closes: list[float]) -> VolatilityStats:
    window = closes[-TRADING_DAYS_WINDOW:] if len(closes) > TRADING_DAYS_WINDOW else closes
    if len(window) < MIN_POINTS:
        return VolatilityStats(
            volatility=0.0,
            volatility_pct=0.0,
            change_60_pct=None,
            last_price=window[-1] if window else None,
            returns=[],
        )

    returns: list[float] = []
    for index in range(1, len(window)):
        prev = window[index - 1]
        if prev <= 0:
            continue
        returns.append(window[index] / prev - 1.0)

    first = window[0]
    last = window[-1]
    change = ((last / first) - 1.0) * 100 if first else None

    if len(returns) < 2:
        return VolatilityStats(
            volatility=0.0,
            volatility_pct=0.0,
            change_60_pct=round(change, 2) if change is not None else None,
            last_price=last,
            returns=returns,
        )

    annualized = statistics.stdev(returns) * math.sqrt(252)
    return VolatilityStats(
        volatility=round(annualized, 6),
        volatility_pct=round(annualized * 100, 2),
        change_60_pct=round(change, 2) if change is not None else None,
        last_price=round(last, 2),
        returns=returns,
    )


def assign_buckets(vols: dict[str, float]) -> dict[str, VolatilityBucket]:
    """Relative quartiles inside the current universe. Tie-break: symbol asc."""
    if not vols:
        return {}
    ordered = sorted(vols.items(), key=lambda item: (item[1], item[0]))
    n = len(ordered)
    edges = [0, n // 4, n // 2, (3 * n) // 4, n]
    buckets: dict[str, VolatilityBucket] = {}
    for quarter, bucket in enumerate(BUCKET_ORDER):
        start, stop = edges[quarter], edges[quarter + 1]
        if stop <= start:
            continue
        for symbol, _ in ordered[start:stop]:
            buckets[symbol] = bucket
    return buckets


def mock_series(symbol: str, name: str | None = None, vol_hint: float | None = None) -> PriceSeries:
    meta = lookup_meta(symbol)
    hint = vol_hint if vol_hint is not None else float(meta["volHint"])
    label = name or str(meta["name"])
    days = weekday_dates_back(PRICE_KEEP_DAYS)
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
        u1 = max(_rand(), 1e-9)
        u2 = _rand()
        noise = math.sqrt(-2.0 * math.log(u1)) * math.cos(2 * math.pi * u2)
        ret = 0.00015 + hint * noise
        price = max(price * (1.0 + ret), 100.0)
        dates.append(day.isoformat())
        closes.append(round(price, 2))
    return PriceSeries(symbol=symbol, name=label, dates=dates, closes=closes)


def mock_universe_series() -> list[PriceSeries]:
    return [
        mock_series(item["symbol"], item["name"], float(item["volHint"]))
        for item in ETF_UNIVERSE
    ]


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


def _raise_if_denied(status_code: int, payload: Any) -> None:
    resp_code = ""
    if isinstance(payload, dict):
        resp_code = str(payload.get("respCode") or "")
    if status_code == 401 or resp_code == "401":
        raise PermissionError(_KRX_AUTH_HINT)
    if status_code == 403:
        raise PermissionError(
            "KRX가 요청을 거부했습니다. KRX_BASE_URL이 "
            "https://data-dbg.krx.co.kr/svc/apis 인지 확인하세요."
        )
    if resp_code and resp_code not in ("0", "0000", ""):
        message = payload.get("respMsg") if isinstance(payload, dict) else "unknown"
        raise RuntimeError(f"KRX 응답 오류 ({resp_code}): {message}")


async def fetch_krx_day(bas_dd: str, auth_key: str, base_url: str) -> list[dict[str, Any]]:
    url = f"{base_url.rstrip('/')}/etp/etf_bydd_trd"
    headers = {
        "AUTH_KEY": auth_key.strip(),
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=False) as client:
        response = await client.post(url, headers=headers, json={"basDd": bas_dd})
    try:
        payload = response.json()
    except ValueError:
        payload = {}
    _raise_if_denied(response.status_code, payload)
    response.raise_for_status()
    rows = payload.get("OutBlock_1") or payload.get("outBlock1") or payload.get("data") or []
    return rows if isinstance(rows, list) else []


async def fetch_krx_universe() -> tuple[list[PriceSeries], Literal["krx", "mock"], Optional[str]]:
    """
    Batch-only: pull ~80 weekday boards once. First 401 → mock immediately.
    """
    settings = get_settings()
    auth_key = (settings.krx_auth_key or "").strip()
    if not auth_key:
        return mock_universe_series(), "mock", "KRX_AUTH_KEY가 없어 모의 ETF 유니버스를 저장했습니다."

    wanted = {item["symbol"]: item["name"] for item in ETF_UNIVERSE}
    buckets: dict[str, dict[str, float]] = {symbol: {} for symbol in wanted}
    days = weekday_dates_back(PRICE_KEEP_DAYS)

    try:
        for day in days:
            rows = await fetch_krx_day(day.strftime("%Y%m%d"), auth_key, settings.krx_base_url)
            iso = day.isoformat()
            for row in rows:
                code = _parse_symbol(row)
                if code not in buckets:
                    continue
                close = _parse_close(row)
                if close is not None:
                    buckets[code][iso] = close
    except PermissionError as exc:
        return mock_universe_series(), "mock", str(exc)
    except Exception as exc:
        return mock_universe_series(), "mock", f"KRX 호출 실패로 모의 데이터를 저장합니다. ({exc})"

    series_list: list[PriceSeries] = []
    for symbol, name in wanted.items():
        day_map = buckets.get(symbol) or {}
        if len(day_map) < MIN_POINTS:
            series_list.append(mock_series(symbol, name))
            continue
        ordered = sorted(day_map.keys())[-PRICE_KEEP_DAYS:]
        series_list.append(
            PriceSeries(
                symbol=symbol,
                name=name,
                dates=ordered,
                closes=[day_map[d] for d in ordered],
            )
        )
    return series_list, "krx", None
