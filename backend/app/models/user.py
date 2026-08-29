"""
Pydantic models for onboarding / user profile payloads.
"""

from typing import Literal, Optional

from pydantic import BaseModel, Field


# 금융투자협회 표준투자권유준칙 기반 실무 5단계 분류.
# 기존 3분류(stable/neutral/aggressive)의 키를 그대로 살려 저장된 프로필이 유효함.
InvestmentPropensity = Literal[
    "stable",           # 안정형
    "stable_seeking",   # 안정추구형
    "neutral",          # 위험중립형
    "aggressive",       # 적극투자형
    "very_aggressive",  # 공격투자형
]


class UserProfileUpdate(BaseModel):
    email: Optional[str] = None
    displayName: str = Field(min_length=1)
    age: int = Field(ge=18, le=100)
    occupation: str = Field(min_length=1)
    # Legacy optional fields: retained for existing Firebase documents only.
    monthlyIncome: Optional[int] = Field(default=None, ge=0)
    fixedExpenses: Optional[int] = Field(default=None, ge=0)
    estimatedMonthlySavings: Optional[int] = Field(default=None, ge=0)
    investmentPropensity: InvestmentPropensity
    targetAssetAmount: int = Field(ge=0)
    targetYears: int = Field(ge=1, le=40)
    goalDescription: str = Field(min_length=1)
    # Legacy Firebase fields — ignored. Assets/debt come from holdings Demo.
    currentAssets: Optional[int] = Field(default=None, ge=0)
    debtBalance: Optional[int] = Field(default=None, ge=0)
    onboardingCompleted: bool = True
    # Demo MyData link flags written at onboarding step 3.
    financialDataLinked: Optional[bool] = None
    financialDataLinkedAt: Optional[str] = None
    financialDataSource: Optional[str] = None
    # False only during the first-report onboarding flow. Missing keeps legacy users unchanged.
    firstReportCompleted: Optional[bool] = None
    createdAt: Optional[str] = None


class UserProfileResponse(UserProfileUpdate):
    uid: str
