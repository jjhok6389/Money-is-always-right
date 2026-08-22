"""
AI financial coach chat endpoints (AWS Bedrock).
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import get_current_user
from app.models.coach import CoachChatRequest, CoachChatResponse
from app.services import coach_service

router = APIRouter()


@router.post("/chat", response_model=CoachChatResponse)
async def coach_chat(
    payload: CoachChatRequest,
    current_user: dict = Depends(get_current_user),
):
    try:
        return await coach_service.chat(current_user["uid"], payload)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI 코치 응답 생성에 실패했습니다. ({exc})",
        ) from exc


@router.get("/suggestions")
def coach_suggestions(current_user: dict = Depends(get_current_user)):
    _ = current_user
    return {"suggestions": coach_service.SUGGESTIONS}
