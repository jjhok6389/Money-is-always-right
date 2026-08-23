"""
Digital twin simulation REST endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import get_current_user
from app.models.simulation import ProfileSimulationRequest, SimulationRequest, SimulationResponse
from app.services import firebase_service, simulation_service

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

    baseline = simulation_service.assumptions_from_profile(profile, payload.currentAssets)
    scenario = baseline.model_copy(update=payload.scenario)
    request = SimulationRequest(
        baseline=baseline,
        scenario=scenario,
        label=payload.label or "맞춤 시나리오",
    )
    return simulation_service.run_simulation(request)
