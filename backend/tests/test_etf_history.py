import asyncio
import unittest
from datetime import date
from unittest.mock import patch

from app.models.etf import EtfDetail, EtfDetailResponse
from app.services.etf_history import fetch_etf_history
from app.services.etf_recommendation import get_etf_detail


class _Frame:
    def __init__(self, rows):
        self.rows = rows
        self.empty = not rows

    def iterrows(self):
        return iter(self.rows)


class _Ticker:
    def __init__(self, symbol, rows=None):
        self.symbol = symbol
        self.calls = []
        self.rows = rows if rows is not None else [
            (date(2024, 1, 2), {"Close": 10_000, "Dividends": 0}),
            (date(2024, 2, 1), {"Close": 10_500, "Dividends": 125.5}),
        ]

    def history(self, **kwargs):
        self.calls.append(kwargs)
        return _Frame(self.rows)


class EtfHistoryTests(unittest.TestCase):
    def test_normalizes_kr_etf_prices_and_dividends(self):
        tickers = []

        def factory(symbol):
            ticker = _Ticker(symbol)
            tickers.append(ticker)
            return ticker

        result = fetch_etf_history("069500", "2024-01-01", "2024-02-01", factory)

        self.assertEqual(tickers[0].symbol, "069500.KS")
        self.assertEqual(tickers[0].calls[0]["end"], "2024-02-02")
        self.assertEqual(result["prices"], [
            {"date": "2024-01-02", "close": 10_000.0},
            {"date": "2024-02-01", "close": 10_500.0},
        ])
        self.assertEqual(result["dividends"], [{"date": "2024-02-01", "amount": 125.5}])
        self.assertEqual(result["asOfDate"], "2024-02-01")

    def test_rejects_empty_history(self):
        with self.assertRaisesRegex(ValueError, "시세 데이터"):
            fetch_etf_history("069500", "2024-01-01", ticker_factory=lambda _: _Ticker("empty", []))

    def test_detail_uses_live_history_and_falls_back_to_stored_series(self):
        stored = EtfDetailResponse(
            source="mock",
            etf=EtfDetail(
                symbol="069500",
                name="KODEX 200",
                volatility=0,
                volatilityPct=0,
                volatilityBucket="low_mid",
                reason="stored",
                series=[{"date": "2024-01-02", "close": 9_900}],
            ),
        )
        fallback = stored.model_copy(deep=True)
        history = {
            "prices": [{"date": "2024-01-03", "close": 10_000}],
            "dividends": [{"date": "2024-01-03", "amount": 100}],
            "asOfDate": "2024-01-03",
        }
        with (
            patch("app.services.etf_recommendation._get_stored_etf_detail", return_value=stored),
            patch("app.services.etf_recommendation.asyncio.to_thread", return_value=history),
        ):
            result = asyncio.run(get_etf_detail("069500", "neutral", "2024-01-01", "2024-01-03"))
        self.assertEqual(result.source, "yfinance")
        self.assertEqual(result.etf.series[0].date, "2024-01-03")
        self.assertEqual(result.etf.dividends[0].amount, 100)

        with (
            patch("app.services.etf_recommendation._get_stored_etf_detail", return_value=fallback),
            patch("app.services.etf_recommendation.asyncio.to_thread", side_effect=RuntimeError("offline")),
        ):
            result = asyncio.run(get_etf_detail("069500", "neutral", "2024-01-01", "2024-01-03"))
        self.assertEqual(result.source, "mock")
        self.assertEqual(result.etf.dividends, [])
        self.assertIn("저장 시계열", result.message)


if __name__ == "__main__":
    unittest.main()
