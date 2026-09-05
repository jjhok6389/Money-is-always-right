"""Tutorial progress and Demo reward API models."""

from typing import Optional

from pydantic import BaseModel, Field


class TutorialChapterProgress(BaseModel):
    completed: bool = False
    completedAt: Optional[str] = None


class TutorialRewardProgress(BaseModel):
    claimed: bool = False
    rewardId: Optional[str] = None
    claimedAt: Optional[str] = None


class TutorialProgressResponse(BaseModel):
    contentVersion: int = 1
    chapters: dict[str, TutorialChapterProgress]
    midpointReward: TutorialRewardProgress
    finalReward: TutorialRewardProgress
    completedCount: int = 0
    totalChapters: int = 6
    updatedAt: Optional[str] = None


class TutorialRewardClaimRequest(BaseModel):
    rewardId: str = Field(min_length=1, max_length=64)
