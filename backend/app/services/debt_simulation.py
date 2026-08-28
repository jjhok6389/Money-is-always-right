"""
Shared debt amortization for future simulation and roadmap-aligned cash-flow policy.

Policy: monthly savings budget pays high-interest loans first; only the remainder
is available for asset accumulation (same priority as personal roadmap).
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from typing import Optional

from app.models.holdings import HoldingLoan


@dataclass
class LoanState:
    balance: int
    interest_rate: float
    monthly_payment: Optional[int]
    institution: str = ""
    loan_name: str = ""


def scheduled_payment(loan: LoanState, monthly_capacity: int) -> int:
    if loan.monthly_payment and loan.monthly_payment > 0:
        return int(loan.monthly_payment)
    return max(int(monthly_capacity * 0.3), 1)


def loan_states_from_holdings(loans: list[HoldingLoan]) -> list[LoanState]:
    return [
        LoanState(
            balance=int(loan.balance),
            interest_rate=float(loan.interestRate),
            monthly_payment=loan.monthlyPayment,
            institution=loan.institution,
            loan_name=loan.loanName,
        )
        for loan in loans
        if int(loan.balance) > 0
    ]


def clone_loan_states(states: list[LoanState]) -> list[LoanState]:
    return deepcopy(states)


def total_debt_balance(states: list[LoanState]) -> int:
    return sum(max(state.balance, 0) for state in states)


def apply_monthly_debt_payments(
    states: list[LoanState],
    budget: int,
    monthly_capacity: int,
) -> tuple[int, int]:
    """Pay loans (highest rate first). Returns (amount_paid, total_remaining_balance)."""
    remaining_budget = max(int(budget), 0)
    total_paid = 0
    for state in sorted(states, key=lambda item: -item.interest_rate):
        if state.balance <= 0 or remaining_budget <= 0:
            continue
        interest = int(round(state.balance * state.interest_rate / 100.0 / 12.0))
        due = min(state.balance + interest, scheduled_payment(state, monthly_capacity))
        payment = min(due, remaining_budget)
        if payment <= 0:
            continue
        interest_paid = min(interest, payment)
        principal_paid = payment - interest_paid
        state.balance = max(0, state.balance - principal_paid)
        remaining_budget -= payment
        total_paid += payment
    return total_paid, total_debt_balance(states)


def first_debt_free_month(
    deposit_intent: int,
    monthly_capacity: int,
    loan_states: list[LoanState],
    horizon_months: int,
) -> Optional[int]:
    states = clone_loan_states(loan_states)
    if not states:
        return 0
    for month in range(1, horizon_months + 1):
        apply_monthly_debt_payments(states, deposit_intent, monthly_capacity)
        if total_debt_balance(states) <= 0:
            return month
    return None
