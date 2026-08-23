"""
Financial product models normalized from the FSS FinLife Open API.
"""

from typing import Literal, Optional

from pydantic import BaseModel, Field

ProductType = Literal["deposit", "saving", "annuity"]


class ProductOption(BaseModel):
    saveTermMonths: int
    interestRate: Optional[float] = None
    maxInterestRate: Optional[float] = None
    interestType: Optional[str] = None
    reserveType: Optional[str] = None


class FinancialProduct(BaseModel):
    productType: ProductType
    companyName: str
    productName: str
    productCode: str
    companyCode: str
    joinWay: Optional[str] = None
    joinMember: Optional[str] = None
    spclCnd: Optional[str] = None
    etcNote: Optional[str] = None
    maxLimit: Optional[int] = None
    disclosureMonth: Optional[str] = None
    options: list[ProductOption] = Field(default_factory=list)
    bestRate: Optional[float] = None
    bestTermMonths: Optional[int] = None


class ProductListResponse(BaseModel):
    source: Literal["fss", "mock"]
    productType: ProductType
    topFinGrpNo: str
    count: int
    products: list[FinancialProduct]
    message: Optional[str] = None
