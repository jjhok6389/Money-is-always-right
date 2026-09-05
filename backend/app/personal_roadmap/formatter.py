"""Console and future AI-Coach-friendly roadmap formatting."""

from __future__ import annotations

from app.personal_roadmap.models import PersonalRoadmap, RoadmapCoachSummary


def _won(value: int | None) -> str:
    return "현재 계산 불가" if value is None else f"{value:,}원"


def format_dry_run(roadmap: PersonalRoadmap) -> str:
    lines = [
        "[DATA QUALITY]",
        f"Financial source: {roadmap.dataQuality.financialSource}",
        f"Current assets estimated: {str(roadmap.dataQuality.currentAssetsEstimated).lower()}",
        f"Debt detail available: {str(roadmap.dataQuality.debtDetailAvailable).lower()}",
        "",
        "[GOAL]",
        f"Target: {_won(roadmap.goal.targetAmount)}",
        f"Baseline expected: {_won(roadmap.projectedGap.baselineExpectedAmount)}",
        f"Projected shortfall: {_won(roadmap.projectedGap.baselineShortfall)}",
    ]
    phase_labels = ("교정", "자동화", "확장")
    for index, item in enumerate(roadmap.months):
        action = item.primaryAction
        phase = phase_labels[index] if index < len(phase_labels) else "확장"
        lines.extend(["", f"[{item.month} · {item.status} · {phase}]", "", "Action:", action.title])
        if action.expectedEffect:
            lines.extend([
                "", "Expected:",
                f"Shortfall {_won(action.expectedEffect.shortfallBefore)} → "
                f"{_won(action.expectedEffect.shortfallAfter)}",
            ])
        elif action.calculationUnavailableReason:
            lines.extend(["", "Expected:", action.calculationUnavailableReason])
        if action.basis:
            lines.extend(["", "Basis:", action.basis.calculator])
    if roadmap.dataQuality.warnings:
        lines.extend(["", "[WARNINGS]", *roadmap.dataQuality.warnings])
    return "\n".join(lines)


def to_coach_summary(roadmap: PersonalRoadmap) -> RoadmapCoachSummary:
    current = roadmap.months[0].primaryAction
    effect = current.expectedEffect.model_dump(mode="json") if current.expectedEffect else None
    basis = current.basis.calculator if current.basis else None
    return RoadmapCoachSummary(
        currentAction=current.title,
        currentReason=current.reason,
        expectedEffect=effect,
        nextActions=[month.primaryAction.title for month in roadmap.months[1:]],
        calculationBasis=basis,
        dataWarnings=roadmap.dataQuality.warnings,
    )
