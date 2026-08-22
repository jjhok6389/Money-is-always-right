"""
Financial Supervisory Service (금감원) FinLife Open API client.

Endpoints used:
  - /depositProductsSearch.json  (정기예금)
  - /savingProductsSearch.json   (적금)

Docs: https://finlife.fss.or.kr/finlife/main/contents.do?menuNo=700029

When FSS_API_KEY is missing or the remote call fails, a curated mock catalog
is returned so frontend/dev work can continue without credentials.
"""

from __future__ import annotations

from typing import Any, Literal

import httpx

from app.config import get_settings
from app.models.product import FinancialProduct, ProductListResponse, ProductOption

ProductType = Literal["deposit", "saving"]

ENDPOINT_BY_TYPE = {
    "deposit": "depositProductsSearch.json",
    "saving": "savingProductsSearch.json",
}


def _to_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _normalize_products(
    product_type: ProductType,
    base_list: list[dict[str, Any]],
    option_list: list[dict[str, Any]],
) -> list[FinancialProduct]:
    options_by_code: dict[str, list[ProductOption]] = {}
    for option in option_list:
        code = option.get("fin_prdt_cd", "")
        options_by_code.setdefault(code, []).append(
            ProductOption(
                saveTermMonths=_to_int(option.get("save_trm")) or 0,
                interestRate=_to_float(option.get("intr_rate")),
                maxInterestRate=_to_float(option.get("intr_rate2")),
                interestType=option.get("intr_rate_type_nm"),
                reserveType=option.get("rsrv_type_nm"),
            )
        )

    products: list[FinancialProduct] = []
    for base in base_list:
        code = base.get("fin_prdt_cd", "")
        options = options_by_code.get(code, [])
        best = None
        best_term = None
        for option in options:
            rate = option.maxInterestRate if option.maxInterestRate is not None else option.interestRate
            if rate is None:
                continue
            if best is None or rate > best:
                best = rate
                best_term = option.saveTermMonths

        products.append(
            FinancialProduct(
                productType=product_type,
                companyName=base.get("kor_co_nm") or "",
                productName=base.get("fin_prdt_nm") or "",
                productCode=code,
                companyCode=base.get("fin_co_no") or "",
                joinWay=base.get("join_way"),
                joinMember=base.get("join_member"),
                spclCnd=base.get("spcl_cnd"),
                etcNote=base.get("etc_note"),
                maxLimit=_to_int(base.get("max_limit")),
                disclosureMonth=base.get("dcls_month"),
                options=options,
                bestRate=best,
                bestTermMonths=best_term,
            )
        )

    products.sort(key=lambda item: item.bestRate or 0, reverse=True)
    return products


def _mock_products(product_type: ProductType) -> list[FinancialProduct]:
    if product_type == "deposit":
        catalog = [
            ("국민은행", "KB Star 정기예금", "KB-DEP-01", 12, 3.2, 3.45),
            ("신한은행", "신한 쏠편한 정기예금", "SH-DEP-01", 12, 3.15, 3.4),
            ("하나은행", "하나 청년도약 예금", "HN-DEP-01", 24, 3.4, 3.7),
            ("우리은행", "우리 첫거래 예금", "WR-DEP-01", 6, 2.9, 3.1),
            ("카카오뱅크", "카카오뱅크 정기예금", "KK-DEP-01", 12, 3.25, 3.35),
        ]
    else:
        catalog = [
            ("국민은행", "KB 청년 적금", "KB-SAV-01", 12, 3.5, 4.2),
            ("신한은행", "신한 청년희망적금", "SH-SAV-01", 24, 3.8, 4.5),
            ("토스뱅크", "토스 자유적금", "TS-SAV-01", 12, 3.6, 4.0),
            ("카카오뱅크", "카카오뱅크 26주적금", "KK-SAV-01", 6, 3.3, 5.0),
            ("기업은행", "IBK 매일적금", "IB-SAV-01", 12, 3.4, 3.9),
        ]

    products: list[FinancialProduct] = []
    for company, name, code, term, base_rate, max_rate in catalog:
        products.append(
            FinancialProduct(
                productType=product_type,
                companyName=company,
                productName=name,
                productCode=code,
                companyCode=f"MOCK-{company}",
                joinWay="스마트폰 / 영업점",
                joinMember="제한없음",
                spclCnd="우대금리 조건은 금융회사 공시를 확인하세요.",
                etcNote="API 키 미설정 시 제공되는 모의 상품입니다.",
                maxLimit=None,
                disclosureMonth="202608",
                options=[
                    ProductOption(
                        saveTermMonths=term,
                        interestRate=base_rate,
                        maxInterestRate=max_rate,
                        interestType="단리",
                        reserveType="정액적립식" if product_type == "saving" else None,
                    )
                ],
                bestRate=max_rate,
                bestTermMonths=term,
            )
        )
    return products


async def fetch_products(
    product_type: ProductType,
    top_fin_grp_no: str | None = None,
    page_no: int = 1,
) -> ProductListResponse:
    settings = get_settings()
    group = top_fin_grp_no or settings.fss_top_fin_grp_no

    if not settings.fss_api_key:
        products = _mock_products(product_type)
        return ProductListResponse(
            source="mock",
            productType=product_type,
            topFinGrpNo=group,
            count=len(products),
            products=products,
            message="FSS_API_KEY가 없어 모의 상품 데이터를 반환했습니다.",
        )

    endpoint = ENDPOINT_BY_TYPE[product_type]
    url = f"{settings.fss_base_url.rstrip('/')}/{endpoint}"
    params = {
        "auth": settings.fss_api_key,
        "topFinGrpNo": group,
        "pageNo": str(page_no),
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            payload = response.json()
    except Exception as exc:
        products = _mock_products(product_type)
        return ProductListResponse(
            source="mock",
            productType=product_type,
            topFinGrpNo=group,
            count=len(products),
            products=products,
            message=f"금감원 API 호출 실패로 모의 데이터를 사용합니다. ({exc})",
        )

    result = payload.get("result") or {}
    products = _normalize_products(
        product_type,
        result.get("baseList") or [],
        result.get("optionList") or [],
    )
    return ProductListResponse(
        source="fss",
        productType=product_type,
        topFinGrpNo=group,
        count=len(products),
        products=products,
        message=None,
    )
