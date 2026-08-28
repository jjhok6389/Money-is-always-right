"""Deterministic three-month personal financial roadmap package."""

from typing import Any


async def generate_personal_roadmap(*args: Any, **kwargs: Any):
    """Lazy package-level entry point that avoids service import cycles."""

    from app.personal_roadmap.roadmap_service import generate_personal_roadmap as run

    return await run(*args, **kwargs)


__all__ = ["generate_personal_roadmap"]
