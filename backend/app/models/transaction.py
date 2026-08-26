"""
Transaction domain models for the Phase 2 dummy data pipeline.
"""

from typing import Literal, Optional

from pydantic import BaseModel, Field

ExpenseType = Literal["income", "fixed", "variable", "savings"]
CategoryCode = Literal[
    "salary",
    "side_income",
    "bonus",
    "refund",
    "food",
    "transport",
    "housing",
    "telecom",
    "insurance",
    "debt",
    "subscription",
    "shopping",
    "leisure",
    "medical",
    "education",
    "savings",
    "income",
    "other",
]


class Transaction(BaseModel):
    id: str
    date: str
    description: str
    merchant: str
    amount: int
    category: CategoryCode
    categoryLabel: str
    expenseType: ExpenseType
    expenseTypeLabel: str
    isIncome: bool = False


class CategorySummary(BaseModel):
    category: CategoryCode
    categoryLabel: str
    totalAmount: int
    count: int
    expenseType: ExpenseType


class FinancialSummary(BaseModel):
    """Single monthly source of truth derived from generated transactions."""

    month: str
    salaryIncome: int = Field(ge=0)
    additionalIncome: int = Field(ge=0)
    totalIncome: int = Field(ge=0)
    fixedLivingExpenses: int = Field(ge=0)
    variableExpenses: int = Field(ge=0)
    savingsAndInvestments: int = Field(ge=0)
    totalExpenses: int = Field(ge=0)
    cashOutflows: int = Field(ge=0)
    netCashflow: int
    monthlySavingsCapacity: int = Field(ge=0)
    source: Literal["mock"] = "mock"


class TransactionPipelineResult(BaseModel):
    userId: str
    generatedAt: str
    month: str
    transactions: list[Transaction]
    categorySummaries: list[CategorySummary]
    financialSummary: FinancialSummary
    totals: dict


class TransactionGenerateRequest(BaseModel):
    month: Optional[str] = Field(
        default=None,
        description="YYYY-MM. Defaults to current month.",
    )
    count: int = Field(default=45, ge=10, le=120)
    seed: Optional[int] = None
