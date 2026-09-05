import unittest

from app.models.dashboard import ProfileSnapshot
from app.services import transaction_pipeline
from app.services.simulation_service import assumptions_from_financial_summary


class TransactionPipelineTest(unittest.TestCase):
    def setUp(self):
        self.result = transaction_pipeline.run_pipeline(
            user_id="financial-summary-test-user",
            month="2026-08",
            count=transaction_pipeline.DEFAULT_TRANSACTION_COUNT,
        )

    def test_same_user_and_month_are_deterministic(self):
        repeated = transaction_pipeline.run_pipeline(
            user_id="financial-summary-test-user",
            month="2026-08",
            count=transaction_pipeline.DEFAULT_TRANSACTION_COUNT,
        )
        self.assertEqual(self.result.transactions, repeated.transactions)
        self.assertEqual(self.result.financialSummary, repeated.financialSummary)

    def test_exactly_one_salary_is_generated(self):
        salary_rows = [tx for tx in self.result.transactions if tx.category == "salary"]
        self.assertEqual(len(salary_rows), 1)
        self.assertTrue(salary_rows[0].isIncome)

    def test_summary_uses_one_consistent_equation(self):
        summary = self.result.financialSummary
        self.assertEqual(summary.totalIncome, summary.salaryIncome + summary.additionalIncome)
        self.assertEqual(
            summary.totalExpenses,
            summary.fixedLivingExpenses + summary.variableExpenses,
        )
        self.assertEqual(
            summary.cashOutflows,
            summary.totalExpenses + summary.savingsAndInvestments,
        )
        self.assertEqual(
            summary.netCashflow,
            summary.totalIncome - summary.cashOutflows,
        )
        self.assertEqual(
            summary.monthlySavingsCapacity,
            max(summary.totalIncome - summary.totalExpenses, 0),
        )

    def test_financial_types_are_separate(self):
        cases = {
            "급여 입금": "income",
            "부수입 정산": "income",
            "건강보험료 자동이체": "fixed",
            "대출 원리금 상환": "fixed",
            "학자금 대출 원리금 상환": "fixed",
            "넷플릭스 구독": "fixed",
            "청약저축 자동이체": "savings",
            "배달의민족": "variable",
        }
        for description, expected in cases.items():
            with self.subTest(description=description):
                classified = transaction_pipeline.classify_transaction(description)
                self.assertEqual(classified["expenseType"], expected)

    def test_loan_repayments_match_holdings_monthly_payment(self):
        from app.services import holdings_pipeline

        holdings = holdings_pipeline.run_pipeline(
            user_id="financial-summary-test-user",
            as_of="2026-08-01",
        )
        debt_txs = [tx for tx in self.result.transactions if tx.category == "debt"]
        expected = [int(loan.monthlyPayment or 0) for loan in holdings.loans if loan.monthlyPayment]
        actual = sorted(tx.amount for tx in debt_txs)
        self.assertEqual(actual, sorted(expected))
        if holdings.loans:
            self.assertTrue(any("학자금" in tx.description or "신용대출" in tx.description for tx in debt_txs))

    def test_profile_money_fields_are_not_required_for_simulation_baseline(self):
        from app.services import holdings_pipeline

        profile = ProfileSnapshot(
            targetAssetAmount=50_000_000,
            targetYears=5,
            goalDescription="주거 자금",
        )
        holdings = holdings_pipeline.run_pipeline(
            user_id="financial-summary-test-user",
            as_of="2026-08-01",
        )
        baseline = assumptions_from_financial_summary(
            self.result.financialSummary,
            profile.model_dump(),
            holdings.totals.totalAssets,
        )
        self.assertEqual(baseline.monthlyIncome, self.result.financialSummary.totalIncome)
        self.assertEqual(baseline.monthlyExpenses, self.result.financialSummary.totalExpenses)
        self.assertEqual(baseline.currentAssets, holdings.totals.totalAssets)


if __name__ == "__main__":
    unittest.main()
