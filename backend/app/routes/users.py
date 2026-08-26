"""
User profile REST endpoints.
React AuthContext -> Firebase ID token -> this router -> Firestore.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import get_current_user
from app.models.user import UserProfileResponse, UserProfileUpdate
from app.services import firebase_service

router = APIRouter()


@router.get("/me", response_model=UserProfileResponse)
def get_my_profile(current_user: dict = Depends(get_current_user)):
    uid = current_user["uid"]
    profile = firebase_service.get_user_document(uid)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="사용자 프로필을 찾을 수 없습니다.",
        )
    return {"uid": uid, **profile}


@router.put("/me", response_model=UserProfileResponse)
def upsert_my_profile(
    payload: UserProfileUpdate,
    current_user: dict = Depends(get_current_user),
):
    uid = current_user["uid"]
    # Omitted legacy financial fields are left untouched in existing documents.
    data = payload.model_dump(exclude_none=True)
    if not data.get("email"):
        data["email"] = current_user.get("email")
    saved = firebase_service.upsert_user_document(uid, data)
    return saved
