from fastapi import APIRouter

from app.services import firebase_service

router = APIRouter(tags=["health"])


@router.get("/health")
def health_check():
    return {
        "status": "ok",
        "phase": 5,
        "demoMode": firebase_service.is_demo_mode(),
    }
