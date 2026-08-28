"""
Demo balance-sheet models (MyData/BankSalad-shaped holdings snapshot).

Cash-flow stays in transaction_pipeline; this layer is account/loan/holding balances.
"""

from typing import Literal, Optional

from pydantic import BaseModel, Field

AccountType = Literal["checking", "deposit", "saving"]
LoanType = Literal["student", "credit", "mortgage", "other"]


class HoldingAccount(BaseModel):
    id: str
    institution: str
    accountName: str
    accountType: AccountType
    balance: int = Field(ge=0)
    rate: Optional[float] = Field(default=None, ge=0)
    maturityDate: Optional[str] = None


class HoldingLoan(BaseModel):
    id: str
    institution: str
    loanName: str
    loanType: LoanType
    balance: int = Field(ge=0)
    interestRate: float = Field(ge=0)
    monthlyPayment: Optional[int] = Field(default=None, ge=0)


class HoldingInvestment(BaseModel):
    id: str
    broker: str
    name: str
    symbol: Optional[str] = None
    quantity: Optional[float] = Field(default=None, ge=0)
    evalAmount: int = Field(ge=0)


class HoldingInsurance(BaseModel):
    id: str
    insurer: str
    productName: str
    monthlyPremium: int = Field(ge=0)
    surrenderValue: int = Field(default=0, ge=0)


class HoldingsTotals(BaseModel):
    cash: int = Field(ge=0)
    deposit: int = Field(ge=0)
    saving: int = Field(ge=0)
    investment: int = Field(ge=0)
    insuranceSurrender: int = Field(ge=0)
    totalAssets: int = Field(ge=0)
    totalLiabilities: int = Field(ge=0)
    netWorth: int


class HoldingsSnapshot(BaseModel):
    """Single balance-sheet source of truth for Demo (and later MyData adapter)."""

    userId: str
    generatedAt: str
    asOf: str
    source: Literal["mock"] = "mock"
    accounts: list[HoldingAccount]
    loans: list[HoldingLoan]
    investments: list[HoldingInvestment]
    insurances: list[HoldingInsurance]
    totals: HoldingsTotals


class HoldingsGenerateRequest(BaseModel):
    asOf: Optional[str] = Field(
        default=None,
        description="YYYY-MM-DD snapshot date. Defaults to first day of current month.",
    )
    seed: Optional[int] = None
    investmentPropensity: Optional[str] = None
