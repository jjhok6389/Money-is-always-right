"""Historical Korean ETF prices and distributions from Yahoo Finance."""

from datetime import date, timedelta
from typing import Any, Callable


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
    frame = ticker_factory(f"{symbol}.KS").history(
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
    return {"prices": prices, "dividends": dividends, "asOfDate": prices[-1]["date"]}
