"""
Transaction pipeline REST endpoints.
"""

from fastapi import APIRouter, Depends, Query

from app.dependencies import get_current_user
from app.models.transaction import TransactionGenerateRequest, TransactionPipelineResult
from app.services import transaction_pipeline

router = APIRouter()


@router.get("/pipeline", response_model=TransactionPipelineResult)
def get_transaction_pipeline(
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    count: int = Query(default=transaction_pipeline.DEFAULT_TRANSACTION_COUNT, ge=10, le=120),
    current_user: dict = Depends(get_current_user),
):
    """Generate, classify, and summarize mocked transactions for the signed-in user."""
    return transaction_pipeline.run_pipeline(
        user_id=current_user["uid"],
        month=month,
        count=count,
    )


@router.post("/pipeline", response_model=TransactionPipelineResult)
def regenerate_transaction_pipeline(
    payload: TransactionGenerateRequest,
    current_user: dict = Depends(get_current_user),
):
    return transaction_pipeline.run_pipeline(
        user_id=current_user["uid"],
        month=payload.month,
        count=payload.count,
        seed=payload.seed,
    )


@router.post("/classify")
def classify_single_transaction(
    description: str = Query(..., min_length=1),
    merchant: str = Query(default=""),
    current_user: dict = Depends(get_current_user),
):
    """Utility endpoint to classify an arbitrary merchant/description string."""
    _ = current_user
    return transaction_pipeline.classify_transaction(description, merchant)
