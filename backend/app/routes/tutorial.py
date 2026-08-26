"""Authenticated financial basics tutorial endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import get_current_user
from app.models.tutorial import TutorialProgressResponse, TutorialRewardClaimRequest
from app.services import tutorial_service

router = APIRouter()


@router.get("/progress", response_model=TutorialProgressResponse)
def get_progress(current_user: dict = Depends(get_current_user)):
    return tutorial_service.get_progress(current_user["uid"])


@router.post("/chapters/{chapter_id}/complete", response_model=TutorialProgressResponse)
def complete_chapter(chapter_id: str, current_user: dict = Depends(get_current_user)):
    try:
        return tutorial_service.complete_chapter(current_user["uid"], chapter_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/rewards/midpoint/claim", response_model=TutorialProgressResponse)
def claim_midpoint_reward(
    payload: TutorialRewardClaimRequest,
    current_user: dict = Depends(get_current_user),
):
    try:
        return tutorial_service.claim_midpoint_reward(current_user["uid"], payload.rewardId)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/rewards/final/claim", response_model=TutorialProgressResponse)
def claim_final_reward(current_user: dict = Depends(get_current_user)):
    try:
        return tutorial_service.claim_final_reward(current_user["uid"])
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
