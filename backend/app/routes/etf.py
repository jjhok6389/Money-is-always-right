"""
ETF recommendation REST endpoints (KRX daily series / mock fallback).
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.dependencies import get_current_user
from app.models.etf import EtfDetailResponse, EtfListResponse
from app.services import etf_recommendation, krx_etf_client

router = APIRouter()


@router.get("/recommendations", response_model=EtfListResponse)
async def list_etf_recommendations(
    propensity: str = Query(default="neutral", description="investmentPropensity 키"),
    current_user: dict = Depends(get_current_user),
):
    _ = current_user
    raw = (propensity or "").strip()
    if raw and raw not in etf_recommendation.VALID_PROPENSITIES:
        # Invalid values fall back to neutral (documented); do not 400 hard-fail demos.
        propensity = "neutral"
    return await etf_recommendation.recommend_etfs(propensity)


@router.get("/{symbol}", response_model=EtfDetailResponse)
async def get_etf_detail(
    symbol: str,
    propensity: str = Query(default="neutral"),
    current_user: dict = Depends(get_current_user),
):
    _ = current_user
    code = (symbol or "").strip()
    if not code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="종목코드가 필요합니다.")

    known = {item["symbol"] for item in krx_etf_client.list_universe()}
    if code not in known:
        # Still allow mock/detail for known-format codes; unknown → 404 for clarity.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="지원 유니버스에 없는 ETF 코드입니다.",
        )
    return await etf_recommendation.get_etf_detail(code, propensity)
