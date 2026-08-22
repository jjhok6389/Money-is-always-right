"""
Personalized dashboard REST endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import get_current_user
from app.models.dashboard import DashboardRequest, DashboardResponse
from app.services import dashboard_service, firebase_service

router = APIRouter()


@router.get("", response_model=DashboardResponse)
async def get_dashboard(current_user: dict = Depends(get_current_user)):
    uid = current_user["uid"]
    profile = firebase_service.get_user_document(uid)
    try:
        return await dashboard_service.build_dashboard(uid, profile, DashboardRequest())
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/compute", response_model=DashboardResponse)
async def compute_dashboard(
    payload: DashboardRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Preferred by the React dashboard: sends the client-side profile snapshot
    so analytics still work if Firestore→API sync is delayed.
    """
    uid = current_user["uid"]
    stored = firebase_service.get_user_document(uid)
    try:
        return await dashboard_service.build_dashboard(uid, stored, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
