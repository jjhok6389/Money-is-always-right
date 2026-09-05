"""CLI for a write-free personal roadmap Dry Run."""

from __future__ import annotations

import argparse
import asyncio

from app.models.dashboard import ProfileSnapshot
from app.personal_roadmap.formatter import format_dry_run
from app.personal_roadmap.models import PersonalRoadmapGenerateRequest
from app.personal_roadmap.roadmap_service import generate_personal_roadmap


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="개인화 3개월 금융 실행 로드맵 생성")
    parser.add_argument("--user-id", default="demo-user")
    parser.add_argument("--month", help="기준 월(YYYY-MM)")
    parser.add_argument("--target-amount", type=int)
    parser.add_argument("--target-years", type=int)
    parser.add_argument(
        "--propensity",
        choices=["stable", "stable_seeking", "neutral", "aggressive", "very_aggressive"],
    )
    parser.add_argument("--goal-description", default="")
    parser.add_argument("--current-assets", type=int)
    parser.add_argument("--debt-balance", type=int)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=True,
        help="외부 상품 조회와 저장 없이 계산 결과만 출력(기본값)",
    )
    return parser


async def _run(args: argparse.Namespace) -> None:
    supplied = [args.target_amount is not None, args.target_years is not None, args.propensity is not None]
    if any(supplied) and not all(supplied):
        raise ValueError("CLI 프로필은 --target-amount, --target-years, --propensity를 모두 입력해야 합니다.")
    profile = None
    if all(supplied):
        profile = ProfileSnapshot(
            investmentPropensity=args.propensity,
            targetAssetAmount=args.target_amount,
            targetYears=args.target_years,
            goalDescription=args.goal_description,
        )
    request = PersonalRoadmapGenerateRequest(
        profile=profile,
        currentAssets=args.current_assets,
        debtBalance=args.debt_balance,
        month=args.month,
        persist=False,
    )
    roadmap = await generate_personal_roadmap(
        args.user_id,
        request,
        stored_profile={} if profile is not None else None,
        dry_run=True,
    )
    print(format_dry_run(roadmap))


def main() -> None:
    args = _parser().parse_args()
    try:
        asyncio.run(_run(args))
    except (ValueError, RuntimeError) as exc:
        raise SystemExit(f"로드맵 Dry Run 실패: {exc}") from exc


if __name__ == "__main__":
    main()
