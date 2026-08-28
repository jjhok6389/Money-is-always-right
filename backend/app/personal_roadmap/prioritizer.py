"""Safety-first deterministic action prioritization."""

from app.personal_roadmap.candidate_actions import ActionCandidate


def prioritize(candidates: list[ActionCandidate]) -> list[ActionCandidate]:
    phase_order = {"CORRECTION": 0, "AUTOMATION": 1, "EXPANSION": 2}
    return sorted(
        candidates,
        key=lambda item: (
            phase_order[item.phase],
            item.safety_rank,
            item.impact_rank,
            item.action.actionType,
        ),
    )
