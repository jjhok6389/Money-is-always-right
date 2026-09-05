"""
Coaching report REST endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import get_current_user
from app.models.report import (
    CoachingReport,
    CoachingReportSummary,
    GenerateReportRequest,
    ReportScheduleResponse,
    ReportScheduleUpdate,
)
from app.services import firebase_service, report_service

router = APIRouter()


@router.post("/generate", response_model=CoachingReport)
async def generate_report(
    payload: GenerateReportRequest,
    current_user: dict = Depends(get_current_user),
):
    uid = current_user["uid"]
    try:
        return await report_service.generate_report(uid, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"리포트 생성에 실패했습니다: {exc}",
        ) from exc


@router.get("", response_model=list[CoachingReportSummary])
def list_reports(current_user: dict = Depends(get_current_user)):
    uid = current_user["uid"]
    return report_service.list_report_summaries(uid)


@router.get("/schedule/me", response_model=ReportScheduleResponse)
def get_report_schedule(current_user: dict = Depends(get_current_user)):
    uid = current_user["uid"]
    profile = firebase_service.get_user_document(uid) or {}
    return ReportScheduleResponse(monthlyReportDay=profile.get("monthlyReportDay"))


@router.put("/schedule", response_model=ReportScheduleResponse)
def update_report_schedule(
    payload: ReportScheduleUpdate,
    current_user: dict = Depends(get_current_user),
):
    uid = current_user["uid"]
    saved = report_service.update_schedule(uid, payload.monthlyReportDay)
    return ReportScheduleResponse(monthlyReportDay=saved.get("monthlyReportDay"))


@router.get("/{report_id}", response_model=CoachingReport)
def get_report(report_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user["uid"]
    report = report_service.get_report(uid, report_id)
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="리포트를 찾을 수 없습니다.",
        )
    return report
