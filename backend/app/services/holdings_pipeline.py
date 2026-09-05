"""
Demo holdings (balance-sheet) pipeline.

Generates seeded account / loan / investment / insurance balances so Gap,
portfolio, and debt roadmap use real-balance-shaped Demo data instead of
savings-capacity estimates. Swap this module for a BankSalad/MyData adapter later.
"""

from __future__ import annotations

import hashlib
import random
from datetime import datetime, timezone
from typing import Optional

from app.models.holdings import (
    HoldingAccount,
    HoldingInsurance,
    HoldingInvestment,
    HoldingLoan,
    HoldingsSnapshot,
    HoldingsTotals,
)

# Propensity nudges investment share of liquid+invested assets (anchors stay fixed).
_INVEST_WEIGHT: dict[str, float] = {
    "stable": 0.55,
    "stable_seeking": 0.75,
    "neutral": 1.0,
    "aggressive": 1.25,
    "very_aggressive": 1.55,
}


def _seed_for(user_id: str, as_of: str, seed: int | None) -> int:
    if seed is not None:
        return seed
    digest = hashlib.sha256(f"holdings:{user_id}:{as_of}".encode()).hexdigest()
    return int(digest[:8], 16)


def _jitter(rng: random.Random, base: int, pct: float = 0.12) -> int:
    factor = 1 + rng.uniform(-pct, pct)
    return max(int(round(base * factor / 10_000) * 10_000), 0)


def _default_as_of(as_of: str | None) -> str:
    if as_of:
        return as_of
    now = datetime.now(timezone.utc)
    return f"{now.year}-{now.month:02d}-01"


def generate_holdings(
    user_id: str,
    as_of: str | None = None,
    seed: int | None = None,
    investment_propensity: str | None = None,
) -> HoldingsSnapshot:
    """Create a reproducible Demo balance sheet for the user."""
    snapshot_date = _default_as_of(as_of)
    rng = random.Random(_seed_for(user_id, snapshot_date, seed))
    propensity = investment_propensity or "neutral"
    invest_mult = _INVEST_WEIGHT.get(propensity, 1.0)

    checking = _jitter(rng, 1_200_000)
    deposit = _jitter(rng, 2_000_000)
    housing_saving = _jitter(rng, 4_800_000)  # 청약 — matches transaction auto-transfer story
    free_saving = _jitter(rng, 1_500_000)
    etf_eval = _jitter(rng, int(800_000 * invest_mult), pct=0.15)
    stock_eval = _jitter(rng, int(350_000 * invest_mult), pct=0.18) if invest_mult >= 0.9 else 0
    surrender = _jitter(rng, 180_000, pct=0.1)

    # Most Demo personas carry modest student debt; ~25% are debt-free.
    has_debt = rng.random() >= 0.25
    student_balance = _jitter(rng, 8_500_000, pct=0.15) if has_debt else 0
    credit_balance = _jitter(rng, 1_200_000, pct=0.2) if has_debt and rng.random() < 0.35 else 0

    year = int(snapshot_date[:4])
    accounts = [
        HoldingAccount(
            id=f"{user_id}-acc-checking",
            institution="카카오뱅크",
            accountName="입출금 통장",
            accountType="checking",
            balance=checking,
            rate=0.1,
        ),
        HoldingAccount(
            id=f"{user_id}-acc-deposit",
            institution="국민은행",
            accountName="정기예금 12개월",
            accountType="deposit",
            balance=deposit,
            rate=3.2,
            maturityDate=f"{year + 1}-03-15",
        ),
        HoldingAccount(
            id=f"{user_id}-acc-housing",
            institution="주택도시기금",
            accountName="청약저축",
            accountType="saving",
            balance=housing_saving,
            rate=2.1,
        ),
        HoldingAccount(
            id=f"{user_id}-acc-saving",
            institution="신한은행",
            accountName="자유적금",
            accountType="saving",
            balance=free_saving,
            rate=3.5,
            maturityDate=f"{year + 1}-08-01",
        ),
    ]

    loans: list[HoldingLoan] = []
    if student_balance > 0:
        loans.append(
            HoldingLoan(
                id=f"{user_id}-loan-student",
                institution="한국장학재단",
                loanName="취업 후 상환 학자금",
                loanType="student",
                balance=student_balance,
                interestRate=2.9,
                monthlyPayment=max(int(round(student_balance * 0.01 / 10_000) * 10_000), 50_000),
            )
        )
    if credit_balance > 0:
        loans.append(
            HoldingLoan(
                id=f"{user_id}-loan-credit",
                institution="우리은행",
                loanName="신용대출",
                loanType="credit",
                balance=credit_balance,
                interestRate=6.8,
                monthlyPayment=max(int(round(credit_balance * 0.03 / 10_000) * 10_000), 30_000),
            )
        )

    investments = [
        HoldingInvestment(
            id=f"{user_id}-inv-etf",
            broker="키움증권",
            name="KODEX 200",
            symbol="069500",
            quantity=round(etf_eval / 35_000, 2) if etf_eval else 0,
            evalAmount=etf_eval,
        ),
    ]
    if stock_eval > 0:
        investments.append(
            HoldingInvestment(
                id=f"{user_id}-inv-stock",
                broker="키움증권",
                name="국내주식 모음",
                symbol=None,
                quantity=None,
                evalAmount=stock_eval,
            )
        )

    insurances = [
        HoldingInsurance(
            id=f"{user_id}-ins-health",
            insurer="삼성화재",
            productName="실손의료보험",
            monthlyPremium=95_000,
            surrenderValue=surrender,
        ),
    ]

    totals = summarize_holdings(accounts, loans, investments, insurances)
    return HoldingsSnapshot(
        userId=user_id,
        generatedAt=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        asOf=snapshot_date,
        source="mock",
        accounts=accounts,
        loans=loans,
        investments=investments,
        insurances=insurances,
        totals=totals,
    )


def summarize_holdings(
    accounts: list[HoldingAccount],
    loans: list[HoldingLoan],
    investments: list[HoldingInvestment],
    insurances: list[HoldingInsurance],
) -> HoldingsTotals:
    cash = sum(a.balance for a in accounts if a.accountType == "checking")
    deposit = sum(a.balance for a in accounts if a.accountType == "deposit")
    saving = sum(a.balance for a in accounts if a.accountType == "saving")
    investment = sum(i.evalAmount for i in investments)
    insurance_surrender = sum(i.surrenderValue for i in insurances)
    total_assets = cash + deposit + saving + investment + insurance_surrender
    total_liabilities = sum(loan.balance for loan in loans)
    return HoldingsTotals(
        cash=cash,
        deposit=deposit,
        saving=saving,
        investment=investment,
        insuranceSurrender=insurance_surrender,
        totalAssets=total_assets,
        totalLiabilities=total_liabilities,
        netWorth=total_assets - total_liabilities,
    )


def portfolio_from_holdings(snapshot: HoldingsSnapshot) -> list[tuple[str, str, int]]:
    """Return (key, label, amount) slices for the dashboard donut."""
    t = snapshot.totals
    # Fold insurance surrender into investment so the existing 4-slice donut stays stable.
    return [
        ("cash", "현금·입출금", t.cash),
        ("deposit", "예금", t.deposit),
        ("saving", "적금", t.saving),
        ("investment", "투자·보험해지", t.investment + t.insuranceSurrender),
    ]


def loans_by_rate_desc(snapshot: HoldingsSnapshot) -> list[HoldingLoan]:
    return sorted(snapshot.loans, key=lambda loan: loan.interestRate, reverse=True)


def run_pipeline(
    user_id: str,
    as_of: str | None = None,
    seed: int | None = None,
    investment_propensity: Optional[str] = None,
) -> HoldingsSnapshot:
    return generate_holdings(
        user_id=user_id,
        as_of=as_of,
        seed=seed,
        investment_propensity=investment_propensity,
    )
