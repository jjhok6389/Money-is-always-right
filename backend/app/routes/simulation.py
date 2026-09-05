"""
Digital twin simulation REST endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import get_current_user
from app.models.simulation import ProfileSimulationRequest, SimulationRequest, SimulationResponse
from app.services import firebase_service, holdings_pipeline, simulation_service, transaction_pipeline

router = APIRouter()


@router.post("/run", response_model=SimulationResponse)
def run_simulation(
    payload: SimulationRequest,
    current_user: dict = Depends(get_current_user),
):
    _ = current_user
    return simulation_service.run_simulation(payload)


@router.post("/from-profile", response_model=SimulationResponse)
def run_from_profile(
    payload: ProfileSimulationRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Build baseline assumptions from the stored/sent profile, then apply scenario overrides.
    """
    uid = current_user["uid"]
    profile = payload.profile or firebase_service.get_user_document(uid)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="온보딩 프로필이 필요합니다.",
        )

    pipeline = transaction_pipeline.run_pipeline(
        user_id=uid,
        count=transaction_pipeline.DEFAULT_TRANSACTION_COUNT,
    )
    holdings = holdings_pipeline.run_pipeline(
        user_id=uid,
        investment_propensity=(profile or {}).get("investmentPropensity"),
    )
    # Manual currentAssets override removed — Demo holdings (later MyData) are the source.
    baseline = simulation_service.assumptions_from_financial_summary(
        pipeline.financialSummary,
        profile,
        holdings.totals.totalAssets,
    )
    scenario = baseline.model_copy(update=payload.scenario)
    request = SimulationRequest(
        baseline=baseline,
        scenario=scenario,
        label=payload.label or "맞춤 시나리오",
        loans=simulation_service.loans_from_holdings(holdings.loans),
    )
    return simulation_service.run_simulation(request)
