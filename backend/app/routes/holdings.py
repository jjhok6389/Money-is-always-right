"""
Demo holdings (balance-sheet) REST endpoints.
"""

from fastapi import APIRouter, Depends, Query

from app.dependencies import get_current_user
from app.models.holdings import HoldingsGenerateRequest, HoldingsSnapshot
from app.services import firebase_service, holdings_pipeline

router = APIRouter()


@router.get("/pipeline", response_model=HoldingsSnapshot)
def get_holdings_pipeline(
    asOf: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    current_user: dict = Depends(get_current_user),
):
    """Generate a seeded Demo balance sheet for the signed-in user."""
    uid = current_user["uid"]
    profile = firebase_service.get_user_document(uid) or {}
    return holdings_pipeline.run_pipeline(
        user_id=uid,
        as_of=asOf,
        investment_propensity=profile.get("investmentPropensity"),
    )


@router.post("/pipeline", response_model=HoldingsSnapshot)
def regenerate_holdings_pipeline(
    payload: HoldingsGenerateRequest,
    current_user: dict = Depends(get_current_user),
):
    uid = current_user["uid"]
    profile = firebase_service.get_user_document(uid) or {}
    propensity = payload.investmentPropensity or profile.get("investmentPropensity")
    return holdings_pipeline.run_pipeline(
        user_id=uid,
        as_of=payload.asOf,
        seed=payload.seed,
        investment_propensity=propensity,
    )
