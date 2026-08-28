"""Authenticated personal financial roadmap endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.dependencies import get_current_user
from app.personal_roadmap.models import PersonalRoadmap, PersonalRoadmapGenerateRequest
from app.personal_roadmap.repository import PersonalRoadmapRepository
from app.personal_roadmap.roadmap_service import generate_personal_roadmap
from app.services import firebase_service

router = APIRouter()


@router.post("/generate", response_model=PersonalRoadmap)
async def generate(
    payload: PersonalRoadmapGenerateRequest,
    current_user: dict = Depends(get_current_user),
):
    uid = current_user["uid"]
    stored = firebase_service.get_user_document(uid)
    try:
        return await generate_personal_roadmap(uid, payload, stored_profile=stored or {})
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="개인 금융 로드맵 생성 중 외부 데이터 조회에 실패했습니다.",
        ) from exc


@router.get("/current", response_model=PersonalRoadmap)
async def current(
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    current_user: dict = Depends(get_current_user),
):
    uid = current_user["uid"]
    if month is not None:
        try:
            PersonalRoadmapGenerateRequest(month=month, persist=False)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    repository = PersonalRoadmapRepository()
    roadmap = repository.get(uid, month) if month else repository.current(uid)
    if roadmap is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="저장된 개인 금융 로드맵이 없습니다.")
    return roadmap
