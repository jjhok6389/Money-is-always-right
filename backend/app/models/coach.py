"""
AI financial coach request/response models.
"""

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class CoachChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[ChatMessage] = Field(default_factory=list, max_length=20)
    # Client-side snapshot so Bedrock answers with the latest onboarding context.
    profile: Optional[dict[str, Any]] = None
    dashboardHints: Optional[dict[str, Any]] = None


class CoachChatResponse(BaseModel):
    reply: str
    source: Literal["bedrock", "fallback"]
    modelId: Optional[str] = None
    suggestions: list[str] = Field(default_factory=list)
