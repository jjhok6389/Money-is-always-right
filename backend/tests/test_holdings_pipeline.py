import unittest

from app.services import holdings_pipeline


class HoldingsPipelineTest(unittest.TestCase):
    def setUp(self):
        self.snapshot = holdings_pipeline.run_pipeline(
            user_id="holdings-test-user",
            as_of="2026-08-01",
            investment_propensity="neutral",
        )

    def test_same_user_and_date_are_deterministic(self):
        repeated = holdings_pipeline.run_pipeline(
            user_id="holdings-test-user",
            as_of="2026-08-01",
            investment_propensity="neutral",
        )
        self.assertEqual(self.snapshot.accounts, repeated.accounts)
        self.assertEqual(self.snapshot.loans, repeated.loans)
        self.assertEqual(self.snapshot.totals, repeated.totals)

    def test_totals_match_line_items(self):
        t = self.snapshot.totals
        self.assertEqual(
            t.totalAssets,
            t.cash + t.deposit + t.saving + t.investment + t.insuranceSurrender,
        )
        self.assertEqual(
            t.totalLiabilities,
            sum(loan.balance for loan in self.snapshot.loans),
        )
        self.assertEqual(t.netWorth, t.totalAssets - t.totalLiabilities)

    def test_portfolio_slices_sum_to_total_assets(self):
        slices = holdings_pipeline.portfolio_from_holdings(self.snapshot)
        self.assertEqual(sum(amount for _, _, amount in slices), self.snapshot.totals.totalAssets)

    def test_loans_sorted_by_rate_desc(self):
        ordered = holdings_pipeline.loans_by_rate_desc(self.snapshot)
        rates = [loan.interestRate for loan in ordered]
        self.assertEqual(rates, sorted(rates, reverse=True))


if __name__ == "__main__":
    unittest.main()
