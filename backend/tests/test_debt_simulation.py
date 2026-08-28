import unittest

from app.services import debt_simulation


class DebtSimulationTests(unittest.TestCase):
    def test_high_rate_loan_paid_before_investing(self):
        loans = [
            debt_simulation.LoanState(
                balance=1_000_000,
                interest_rate=12.0,
                monthly_payment=200_000,
            ),
        ]
        paid, remaining = debt_simulation.apply_monthly_debt_payments(loans, 250_000, 800_000)
        self.assertEqual(paid, 200_000)
        self.assertLess(remaining, 1_000_000)

    def test_first_debt_free_month(self):
        loans = [
            debt_simulation.LoanState(
                balance=300_000,
                interest_rate=6.0,
                monthly_payment=100_000,
            ),
        ]
        month = debt_simulation.first_debt_free_month(150_000, 800_000, loans, 24)
        self.assertIsNotNone(month)
        self.assertGreaterEqual(month, 1)


if __name__ == '__main__':
    unittest.main()
