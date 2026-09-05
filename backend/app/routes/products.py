"""
Savings / deposit / annuity product endpoints backed by the FSS FinLife Open API.
"""

from typing import Literal

from fastapi import APIRouter, Depends, Query

from app.dependencies import get_current_user
from app.models.product import ProductListResponse
from app.services import fss_client

router = APIRouter()


@router.get("/deposits", response_model=ProductListResponse)
async def list_deposit_products(
    topFinGrpNo: str | None = Query(default=None, description="금융권역코드, 예: 020000"),
    pageNo: int = Query(default=1, ge=1, le=50),
    current_user: dict = Depends(get_current_user),
):
    _ = current_user
    return await fss_client.fetch_products("deposit", topFinGrpNo, pageNo)


@router.get("/savings", response_model=ProductListResponse)
async def list_saving_products(
    topFinGrpNo: str | None = Query(default=None, description="금융권역코드, 예: 020000"),
    pageNo: int = Query(default=1, ge=1, le=50),
    current_user: dict = Depends(get_current_user),
):
    _ = current_user
    return await fss_client.fetch_products("saving", topFinGrpNo, pageNo)


@router.get("/annuities", response_model=ProductListResponse)
async def list_annuity_products(
    topFinGrpNo: str | None = Query(
        default=None,
        description="금융권역코드, 예: 050000(보험), 060000(금융투자)",
    ),
    pageNo: int = Query(default=1, ge=1, le=50),
    current_user: dict = Depends(get_current_user),
):
    _ = current_user
    return await fss_client.fetch_products("annuity", topFinGrpNo, pageNo)


@router.get("", response_model=ProductListResponse)
async def list_products(
    productType: Literal["deposit", "saving", "annuity"] = Query(default="saving"),
    topFinGrpNo: str | None = Query(default=None),
    pageNo: int = Query(default=1, ge=1, le=50),
    current_user: dict = Depends(get_current_user),
):
    _ = current_user
    return await fss_client.fetch_products(productType, topFinGrpNo, pageNo)
