"""
Dummy financial transaction pipeline.

Flow:
  1) Generate mocked card/bank ledger rows for a given month
  2) Classify each row into a consumption category
  3) Tag fixed vs variable expense (and income)
  4) Aggregate category summaries for dashboard Phase 3
"""

from __future__ import annotations

import hashlib
import random
from collections import defaultdict
from datetime import datetime
from typing import Any

from app.models.transaction import (
    CategorySummary,
    Transaction,
    TransactionPipelineResult,
)

CATEGORY_META: dict[str, dict[str, str]] = {
    "food": {"label": "식비", "expenseType": "variable"},
    "transport": {"label": "교통", "expenseType": "variable"},
    "housing": {"label": "주거", "expenseType": "fixed"},
    "telecom": {"label": "통신", "expenseType": "fixed"},
    "shopping": {"label": "쇼핑", "expenseType": "variable"},
    "leisure": {"label": "문화/여가", "expenseType": "variable"},
    "medical": {"label": "의료", "expenseType": "variable"},
    "education": {"label": "교육", "expenseType": "variable"},
    "savings": {"label": "이체/저축", "expenseType": "fixed"},
    "income": {"label": "소득", "expenseType": "fixed"},
    "other": {"label": "기타", "expenseType": "variable"},
}

EXPENSE_TYPE_LABELS = {
    "fixed": "고정비",
    "variable": "변동비",
}

# Keyword → category rules applied in order (first match wins).
CLASSIFICATION_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("income", ("급여", "월급", "보너스", "이체입금", "환급")),
    ("housing", ("월세", "관리비", "부동산", "전세", "수도요금", "전기요금", "가스요금")),
    ("telecom", ("SKT", "KT", "LG유플러스", "통신요금", "인터넷")),
    ("savings", ("적금", "예금", "자동이체", "펀드", "청약")),
    ("transport", ("지하철", "버스", "택시", "카카오T", "주유", "주차", "코레일")),
    ("food", ("스타벅스", "이디야", "배민", "쿠팡이츠", "배달", "식당", "편의점", "마트", "GS25", "CU", "세븐일레븐")),
    ("shopping", ("쿠팡", "무신사", "올리브영", "다이소", "백화점", "아울렛")),
    ("leisure", ("넷플릭스", "유튜브", "영화", "공연", "게임", "스포티파이", "멜론")),
    ("medical", ("병원", "약국", "한의원", "치과", "실손")),
    ("education", ("학원", "인강", "강의", "도서", "패스트캠퍼스")),
]

MERCHANT_POOL: list[tuple[str, str, tuple[int, int]]] = [
    ("급여 입금", "income", (2_800_000, 3_500_000)),
    ("월세 자동이체", "housing", (450_000, 700_000)),
    ("관리비", "housing", (80_000, 150_000)),
    ("SKT 통신요금", "telecom", (55_000, 85_000)),
    ("KT 인터넷", "telecom", (30_000, 45_000)),
    ("청약저축 자동이체", "savings", (100_000, 300_000)),
    ("적금 자동이체", "savings", (200_000, 500_000)),
    ("지하철 교통비", "transport", (1_400, 45_000)),
    ("카카오T 택시", "transport", (8_000, 28_000)),
    ("스타벅스 강남점", "food", (4_500, 18_000)),
    ("배달의민족", "food", (12_000, 35_000)),
    ("GS25 편의점", "food", (3_000, 15_000)),
    ("이마트 장보기", "food", (25_000, 90_000)),
    ("쿠팡 로켓배송", "shopping", (15_000, 120_000)),
    ("무신사", "shopping", (29_000, 150_000)),
    ("올리브영", "shopping", (8_000, 45_000)),
    ("넷플릭스 구독", "leisure", (17_000, 17_000)),
    ("멜론 이용권", "leisure", (10_900, 10_900)),
    ("CGV 영화", "leisure", (12_000, 28_000)),
    ("동네약국", "medical", (3_000, 25_000)),
    ("내과 진료", "medical", (10_000, 50_000)),
    ("온라인 강의", "education", (30_000, 200_000)),
    ("서점 도서", "education", (12_000, 35_000)),
]


def classify_transaction(description: str, merchant: str = "") -> dict[str, str]:
    """Classify a free-text ledger row into category + fixed/variable."""
    text = f"{description} {merchant}".upper()
    for category, keywords in CLASSIFICATION_RULES:
        for keyword in keywords:
            if keyword.upper() in text:
                meta = CATEGORY_META[category]
                return {
                    "category": category,
                    "categoryLabel": meta["label"],
                    "expenseType": meta["expenseType"],
                    "expenseTypeLabel": EXPENSE_TYPE_LABELS[meta["expenseType"]],
                }

    meta = CATEGORY_META["other"]
    return {
        "category": "other",
        "categoryLabel": meta["label"],
        "expenseType": meta["expenseType"],
        "expenseTypeLabel": EXPENSE_TYPE_LABELS[meta["expenseType"]],
    }


def _seed_for(user_id: str, month: str, seed: int | None) -> int:
    if seed is not None:
        return seed
    digest = hashlib.sha256(f"{user_id}:{month}".encode()).hexdigest()
    return int(digest[:8], 16)


def _month_days(month: str) -> int:
    year, mon = map(int, month.split("-"))
    if mon == 12:
        next_month = datetime(year + 1, 1, 1)
    else:
        next_month = datetime(year, mon + 1, 1)
    return (next_month - datetime(year, mon, 1)).days


def generate_raw_transactions(user_id: str, month: str, count: int, seed: int | None) -> list[dict[str, Any]]:
    """Create mocked ledger rows before classification."""
    rng = random.Random(_seed_for(user_id, month, seed))
    days = _month_days(month)
    rows: list[dict[str, Any]] = []

    # Always include a few fixed-cost anchors so classification demos are stable.
    anchors = [
        ("급여 입금", 3_200_000, 1),
        ("월세 자동이체", 550_000, 1),
        ("SKT 통신요금", 69_000, 5),
        ("청약저축 자동이체", 200_000, 10),
        ("넷플릭스 구독", 17_000, 12),
    ]
    for merchant, amount, day in anchors:
        rows.append(
            {
                "date": f"{month}-{day:02d}",
                "description": merchant,
                "merchant": merchant,
                "amount": amount,
            }
        )

    remaining = max(count - len(rows), 0)
    for _ in range(remaining):
        merchant, _, amount_range = rng.choice(MERCHANT_POOL)
        low, high = amount_range
        amount = rng.randint(low, high)
        day = rng.randint(1, days)
        rows.append(
            {
                "date": f"{month}-{day:02d}",
                "description": merchant,
                "merchant": merchant,
                "amount": amount,
            }
        )

    rows.sort(key=lambda item: item["date"])
    return rows


def process_transactions(raw_rows: list[dict[str, Any]], user_id: str) -> list[Transaction]:
    """Classify and normalize raw ledger rows."""
    processed: list[Transaction] = []
    for index, row in enumerate(raw_rows, start=1):
        classified = classify_transaction(row["description"], row.get("merchant", ""))
        is_income = classified["category"] == "income"
        processed.append(
            Transaction(
                id=f"{user_id}-{row['date']}-{index}",
                date=row["date"],
                description=row["description"],
                merchant=row.get("merchant", row["description"]),
                amount=int(row["amount"]),
                category=classified["category"],  # type: ignore[arg-type]
                categoryLabel=classified["categoryLabel"],
                expenseType=classified["expenseType"],  # type: ignore[arg-type]
                expenseTypeLabel=classified["expenseTypeLabel"],
                isIncome=is_income,
            )
        )
    return processed


def summarize_transactions(transactions: list[Transaction]) -> tuple[list[CategorySummary], dict[str, int]]:
    bucket: dict[str, dict[str, Any]] = defaultdict(lambda: {"total": 0, "count": 0, "expenseType": "variable"})
    income_total = 0
    fixed_total = 0
    variable_total = 0

    for tx in transactions:
        if tx.isIncome:
            income_total += tx.amount
            continue
        bucket[tx.category]["total"] += tx.amount
        bucket[tx.category]["count"] += 1
        bucket[tx.category]["expenseType"] = tx.expenseType
        bucket[tx.category]["label"] = tx.categoryLabel
        if tx.expenseType == "fixed":
            fixed_total += tx.amount
        else:
            variable_total += tx.amount

    summaries = [
        CategorySummary(
            category=category,  # type: ignore[arg-type]
            categoryLabel=values["label"],
            totalAmount=values["total"],
            count=values["count"],
            expenseType=values["expenseType"],
        )
        for category, values in sorted(bucket.items(), key=lambda item: item[1]["total"], reverse=True)
    ]

    totals = {
        "income": income_total,
        "fixedExpenses": fixed_total,
        "variableExpenses": variable_total,
        "totalExpenses": fixed_total + variable_total,
        "netCashflow": income_total - (fixed_total + variable_total),
    }
    return summaries, totals


def run_pipeline(
    user_id: str,
    month: str | None = None,
    count: int = 40,
    seed: int | None = None,
) -> TransactionPipelineResult:
    target_month = month or datetime.now().strftime("%Y-%m")
    raw = generate_raw_transactions(user_id, target_month, count, seed)
    processed = process_transactions(raw, user_id)
    summaries, totals = summarize_transactions(processed)
    return TransactionPipelineResult(
        userId=user_id,
        generatedAt=datetime.utcnow().isoformat() + "Z",
        month=target_month,
        transactions=processed,
        categorySummaries=summaries,
        totals=totals,
    )
