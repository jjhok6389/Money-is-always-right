"""Historical Korean ETF prices and distributions from Yahoo Finance."""

import logging
import time
from datetime import date, timedelta
from typing import Any, Callable

logger = logging.getLogger(__name__)

MAX_FETCH_ATTEMPTS = 3
RETRY_DELAY_SECONDS = 1.5


def _iso(value: Any) -> str:
    return value.date().isoformat() if hasattr(value, "date") else value.isoformat()


def fetch_etf_history(
    symbol: str,
    start_date: str,
    end_date: str | None = None,
    ticker_factory: Callable[[str], Any] | None = None,
) -> dict[str, Any]:
    if ticker_factory is None:
        import yfinance as yf

        ticker_factory = yf.Ticker

    end = date.fromisoformat(end_date) if end_date else date.today()
    ticker_symbol = f"{symbol.strip()}.KS"
    last_error: Exception | None = None

    for attempt in range(1, MAX_FETCH_ATTEMPTS + 1):
        try:
            frame = ticker_factory(ticker_symbol).history(
                start=start_date,
                end=(end + timedelta(days=1)).isoformat(),
                auto_adjust=False,
                actions=True,
            )
            if frame.empty:
                raise ValueError("조회 기간의 시세 데이터가 없습니다.")

            prices = []
            dividends = []
            for index, row in frame.iterrows():
                day = _iso(index)
                close = float(row["Close"])
                if close > 0:
                    prices.append({"date": day, "close": close})
                amount = float(row.get("Dividends", 0) or 0)
                if amount > 0:
                    dividends.append({"date": day, "amount": amount})

            if not prices:
                raise ValueError("조회 기간의 시세 데이터가 없습니다.")

            logger.info(
                "yfinance history loaded for %s (%s ~ %s): %d prices, %d dividends",
                symbol.strip(),
                start_date,
                end_date or end.isoformat(),
                len(prices),
                len(dividends),
            )
            return {"prices": prices, "dividends": dividends, "asOfDate": prices[-1]["date"]}
        except Exception as exc:
            last_error = exc
            logger.warning(
                "yfinance attempt %d/%d failed for %s (%s ~ %s): %s",
                attempt,
                MAX_FETCH_ATTEMPTS,
                symbol.strip(),
                start_date,
                end_date or end.isoformat(),
                exc,
            )
            if attempt < MAX_FETCH_ATTEMPTS:
                time.sleep(RETRY_DELAY_SECONDS)

    assert last_error is not None
    raise last_error
