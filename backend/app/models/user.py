"""
Pydantic models for onboarding / user profile payloads.
"""

from typing import Literal, Optional

from pydantic import BaseModel, Field


InvestmentPropensity = Literal["stable", "neutral", "aggressive"]


class UserProfileUpdate(BaseModel):
    email: Optional[str] = None
    displayName: str = Field(min_length=1)
    age: int = Field(ge=18, le=100)
    occupation: str = Field(min_length=1)
    monthlyIncome: int = Field(ge=0)
    fixedExpenses: int = Field(ge=0)
    estimatedMonthlySavings: int = Field(ge=0)
    investmentPropensity: InvestmentPropensity
    targetAssetAmount: int = Field(ge=0)
    targetYears: int = Field(ge=1, le=40)
    goalDescription: str = Field(min_length=1)
    onboardingCompleted: bool = True
    createdAt: Optional[str] = None


class UserProfileResponse(UserProfileUpdate):
    uid: str
