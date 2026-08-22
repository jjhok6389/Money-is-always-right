"""
Transaction domain models for the Phase 2 dummy data pipeline.
"""

from typing import Literal, Optional

from pydantic import BaseModel, Field

ExpenseType = Literal["fixed", "variable"]
CategoryCode = Literal[
    "food",
    "transport",
    "housing",
    "telecom",
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


class TransactionPipelineResult(BaseModel):
    userId: str
    generatedAt: str
    month: str
    transactions: list[Transaction]
    categorySummaries: list[CategorySummary]
    totals: dict


class TransactionGenerateRequest(BaseModel):
    month: Optional[str] = Field(
        default=None,
        description="YYYY-MM. Defaults to current month.",
    )
    count: int = Field(default=40, ge=10, le=120)
    seed: Optional[int] = None
