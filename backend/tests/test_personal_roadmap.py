"""Unit tests for deterministic personal roadmap calculation and prioritization."""

from __future__ import annotations

import unittest
from pathlib import Path

from app.models.dashboard import ProfileSnapshot, RecommendedProduct
from app.models.etf import EtfSummary
from app.models.transaction import FinancialSummary
from app.personal_roadmap.candidate_actions import build_candidates
from app.personal_roadmap.financial_state import RoadmapFinancialState
from app.personal_roadmap.gap_adapter import analyze_gap
from app.personal_roadmap.long_term_plan import build_long_term_plan, month_distance
from app.personal_roadmap.models import DataQuality, PersonalRoadmapGenerateRequest
from app.personal_roadmap.prioritizer import prioritize
from app.personal_roadmap.repository import PersonalRoadmapRepository
from app.personal_roadmap.roadmap_generator import add_months, generate_months
from app.personal_roadmap.roadmap_service import (
    _build_calculation_only_dashboard,
    generate_personal_roadmap,
)


def summary(
    *,
    income: int = 3_000_000,
    fixed: int = 1_000_000,
    variable: int = 1_000_000,
    savings: int = 300_000,
) -> FinancialSummary:
    expenses = fixed + variable
    return FinancialSummary(
        month="2026-12",
        salaryIncome=income,
        additionalIncome=0,
        totalIncome=income,
        fixedLivingExpenses=fixed,
        variableExpenses=variable,
        savingsAndInvestments=savings,
        totalExpenses=expenses,
        cashOutflows=expenses + savings,
        netCashflow=income - expenses - savings,
        monthlySavingsCapacity=max(income - expenses, 0),
        source="mock",
    )


def state(
    *,
    propensity: str = "neutral",
    target: int = 30_000_000,
    debt: int = 0,
    debt_known: bool = True,
    financial_summary: FinancialSummary | None = None,
    with_etf: bool = True,
) -> RoadmapFinancialState:
    financial_summary = financial_summary or summary()
    profile = ProfileSnapshot(
        investmentPropensity=propensity,
        targetAssetAmount=target,
        targetYears=3,
        goalDescription="주거자금",
    )
    products = (
        RecommendedProduct(
            productType="saving",
            companyName="테스트은행",
            productName="테스트적금",
            reason="실행 수단 후보",
        ),
    )
    etfs = (
        EtfSummary(
            symbol="TEST",
            name="테스트 ETF",
            volatility=0.1,
            volatilityPct=10,
            volatilityBucket="low_mid",
            reason="기존 추천 정책 후보",
        ),
    ) if with_etf else ()
    current_assets = 5_000_000
    return RoadmapFinancialState(
        month="2026-12",
        profile=profile,
        summary=financial_summary,
        current_assets=current_assets,
        current_assets_estimated=False,
        debt_balance=debt,
        debt_balance_known=debt_known,
        current_asset_gap=max(target - current_assets, 0),
        goal_on_track=False,
        recommended_products=products,
        recommended_etfs=etfs,
        consumption=(
            {
                "expenseType": "variable",
                "amount": financial_summary.variableExpenses,
                "categoryLabel": "식비",
            },
        ) if financial_summary.variableExpenses else (),
        top_variable_category="식비" if financial_summary.variableExpenses else None,
        data_quality=DataQuality(
            financialSource="mock",
            currentAssetsEstimated=False,
            debtBalanceKnown=debt_known,
            warnings=["월간 금융데이터는 Demo 거래 기반입니다."],
        ),
    )


class GapAndGeneratorTests(unittest.TestCase):
    def test_three_months_and_calendar_rollover(self):
        financial_state = state()
        gap = analyze_gap(financial_state)
        months = generate_months("2026-12", prioritize(build_candidates(financial_state, gap)))
        self.assertEqual([item.month for item in months], ["2026-12", "2027-01", "2027-02"])
        self.assertEqual([item.status for item in months], ["CURRENT", "PLANNED", "EXPECTED"])
        self.assertEqual(add_months("2026-12", 12), "2027-12")

    def test_months_do_not_repeat_the_same_saving_routine_or_effect(self):
        financial_state = state(target=500_000_000)
        months = generate_months(
            "2026-08",
            prioritize(build_candidates(financial_state, analyze_gap(financial_state))),
        )
        actions = [item.primaryAction for item in months]
        action_types = [action.actionType for action in actions]

        self.assertEqual(action_types[:2], ["REDUCE_VARIABLE_SPENDING", "AUTOMATE_SAVING"])
        self.assertNotIn("MAINTAIN_SAVING", action_types)
        self.assertIsNotNone(actions[0].expectedEffect)
        self.assertIsNotNone(actions[0].basis)
        self.assertIsNone(actions[1].expectedEffect)
        self.assertIsNone(actions[1].basis)
        self.assertEqual(len({action.title for action in actions}), 3)

    def test_cashflow_risk_follows_correction_automation_recheck_story(self):
        risky_summary = summary(savings=1_200_000)
        financial_state = state(
            propensity="very_aggressive",
            financial_summary=risky_summary,
        )
        months = generate_months(
            "2026-08",
            prioritize(build_candidates(financial_state, analyze_gap(financial_state))),
        )
        self.assertEqual(
            [month.primaryAction.actionType for month in months],
            ["IMPROVE_CASH_FLOW", "AUTOMATE_CASH_FLOW", "CHECK_PROGRESS"],
        )

    def test_debt_story_automates_payment_then_expands_repayment(self):
        financial_state = state(propensity="aggressive", debt=2_000_000)
        months = generate_months(
            "2026-08",
            prioritize(build_candidates(financial_state, analyze_gap(financial_state))),
        )
        actions = [month.primaryAction for month in months]
        self.assertEqual(
            [action.actionType for action in actions],
            ["REVIEW_DEBT", "AUTOMATE_DEBT_PAYMENT", "EXPAND_DEBT_REPAYMENT"],
        )
        self.assertTrue(all(action.expectedEffect is None for action in actions))
        self.assertFalse(any("ETF" in action.actionType for action in actions))

    def test_on_track_stable_profile_still_has_all_three_phases(self):
        financial_state = state(propensity="stable", target=12_000_000)
        months = generate_months(
            "2026-08",
            prioritize(build_candidates(financial_state, analyze_gap(financial_state))),
        )
        self.assertEqual(
            [month.primaryAction.actionType for month in months],
            ["MAINTAIN_SAVING", "AUTOMATE_SAVING", "REVIEW_SAVING_PRODUCT"],
        )

    def test_safe_neutral_profile_expands_to_etf_review_only_in_third_month(self):
        financial_state = state(propensity="neutral", target=12_000_000)
        months = generate_months(
            "2026-08",
            prioritize(build_candidates(financial_state, analyze_gap(financial_state))),
        )
        actions = [month.primaryAction for month in months]
        self.assertEqual(actions[2].actionType, "REVIEW_ETF_INVESTMENT")
        self.assertIsNone(actions[2].expectedEffect)
        self.assertIsNone(actions[2].basis)
        self.assertIsNotNone(actions[2].investmentDisclaimer)

    def test_gap_and_scenario_use_existing_simulation_results(self):
        financial_state = state(target=30_000_000)
        gap = analyze_gap(financial_state)
        self.assertEqual(
            gap.projected_gap.baselineShortfall,
            max(30_000_000 - gap.expected_effect.baselineExpectedAmount, 0),
        )
        self.assertEqual(
            gap.expected_effect.shortfallAfter,
            max(30_000_000 - gap.expected_effect.scenarioExpectedAmount, 0),
        )
        self.assertEqual(
            gap.scenario.monthlyExpenses,
            max(gap.baseline.monthlyExpenses - gap.reduction_amount, 0),
        )
        self.assertEqual(gap.basis.annualInterestRate, 3.5)
        self.assertTrue(gap.expected_effect.assumptionBased)

    def test_months_saved_only_when_both_scenarios_hit(self):
        reachable = analyze_gap(state(target=12_000_000))
        self.assertIsNotNone(reachable.projected_gap.baselineTargetHitMonth)
        self.assertIsNotNone(reachable.expected_effect.estimatedMonthsSaved)

        unreachable = analyze_gap(state(target=500_000_000))
        self.assertIsNone(unreachable.projected_gap.baselineTargetHitMonth)
        self.assertIsNone(unreachable.expected_effect.estimatedMonthsSaved)

    def test_no_variable_spending_does_not_invent_fallback_cut(self):
        no_variable = summary(variable=0)
        gap = analyze_gap(state(financial_summary=no_variable))
        self.assertEqual(gap.reduction_amount, 0)
        self.assertIsNone(gap.expected_effect)


class PriorityTests(unittest.TestCase):
    def test_negative_cashflow_is_first_for_aggressive_profile(self):
        risky_summary = summary(savings=1_200_000)
        financial_state = state(propensity="very_aggressive", financial_summary=risky_summary)
        gap = analyze_gap(financial_state)
        ordered = prioritize(build_candidates(financial_state, gap))
        self.assertEqual(ordered[0].action.actionType, "IMPROVE_CASH_FLOW")
        self.assertFalse(any(item.action.actionType == "REVIEW_ETF_INVESTMENT" for item in ordered))

    def test_debt_precedes_investment_and_blocks_etf(self):
        financial_state = state(propensity="aggressive", debt=2_000_000)
        ordered = prioritize(build_candidates(financial_state, analyze_gap(financial_state)))
        self.assertEqual(ordered[0].action.actionType, "REVIEW_DEBT")
        self.assertFalse(any(item.action.actionType == "REVIEW_ETF_INVESTMENT" for item in ordered))

    def test_stable_never_forces_etf(self):
        financial_state = state(propensity="stable")
        ordered = prioritize(build_candidates(financial_state, analyze_gap(financial_state)))
        self.assertFalse(any(item.action.actionType == "REVIEW_ETF_INVESTMENT" for item in ordered))
        self.assertTrue(any(item.action.actionType == "REVIEW_SAVING_PRODUCT" for item in ordered))

    def test_unknown_debt_does_not_unlock_investment(self):
        financial_state = state(propensity="aggressive", debt_known=False)
        ordered = prioritize(build_candidates(financial_state, analyze_gap(financial_state)))
        self.assertFalse(any(item.action.actionType == "REVIEW_ETF_INVESTMENT" for item in ordered))

    def test_neutral_etf_is_execution_review_without_numeric_effect(self):
        financial_state = state(propensity="neutral")
        ordered = prioritize(build_candidates(financial_state, analyze_gap(financial_state)))
        etf = next(item.action for item in ordered if item.action.actionType == "REVIEW_ETF_INVESTMENT")
        self.assertIsNone(etf.expectedEffect)
        self.assertTrue(etf.executionMeans)
        months = generate_months("2026-12", ordered)
        placed = [month.primaryAction.actionType for month in months]
        placed.extend(
            month.secondaryAction.actionType for month in months if month.secondaryAction is not None
        )
        self.assertIn("REVIEW_ETF_INVESTMENT", placed)


class ServiceAndRepositoryTests(unittest.IsolatedAsyncioTestCase):
    async def test_dry_run_generates_demo_warning_estimate_and_never_saves(self):
        class FailingRepository:
            def save(self, _roadmap):
                raise AssertionError("Dry Run must not save")

        request = PersonalRoadmapGenerateRequest(
            profile=ProfileSnapshot(
                investmentPropensity="neutral",
                targetAssetAmount=30_000_000,
                targetYears=3,
            ),
            month="2026-12",
            persist=True,
        )
        roadmap = await generate_personal_roadmap(
            "dry-run-test",
            request,
            stored_profile={},
            repository=FailingRepository(),
            dry_run=True,
        )
        self.assertEqual(len(roadmap.months), 3)
        self.assertTrue(roadmap.dataQuality.currentAssetsEstimated)
        self.assertEqual(roadmap.dataQuality.financialSource, "mock")
        self.assertTrue(any("Demo" in item for item in roadmap.dataQuality.warnings))

    async def test_explicit_zero_assets_and_debt_are_not_treated_as_missing(self):
        request = PersonalRoadmapGenerateRequest(
            profile=ProfileSnapshot(
                investmentPropensity="stable",
                targetAssetAmount=30_000_000,
                targetYears=3,
            ),
            currentAssets=0,
            debtBalance=0,
            month="2026-12",
            persist=False,
        )
        roadmap = await generate_personal_roadmap(
            "zero-values",
            request,
            stored_profile={},
            dry_run=True,
        )
        self.assertFalse(roadmap.dataQuality.currentAssetsEstimated)
        self.assertTrue(roadmap.dataQuality.debtBalanceKnown)
        self.assertEqual(roadmap.projectedGap.currentAssetGap, 30_000_000)

    async def test_demo_repository_upserts_and_preserves_matching_status(self):
        request = PersonalRoadmapGenerateRequest(
            profile=ProfileSnapshot(
                investmentPropensity="stable",
                targetAssetAmount=30_000_000,
                targetYears=3,
            ),
            currentAssets=1_000_000,
            debtBalance=0,
            month="2026-12",
            persist=False,
        )
        roadmap = await generate_personal_roadmap(
            "repo-user",
            request,
            stored_profile={},
            dry_run=True,
        )
        repository = PersonalRoadmapRepository(force_demo=True)
        roadmap.months[0].status = "COMPLETED"
        repository.save(roadmap)
        regenerated = roadmap.model_copy(deep=True)
        regenerated.months[0].status = "CURRENT"
        saved = repository.save(regenerated)
        self.assertEqual(saved.roadmapId, "repo-user_2026-12")
        self.assertEqual(saved.months[0].status, "COMPLETED")
        self.assertIsNone(repository.get("other-user", "2026-12"))

    async def test_goal_month_is_fixed_and_remaining_horizon_declines(self):
        repository = PersonalRoadmapRepository(force_demo=True)
        profile = ProfileSnapshot(
            investmentPropensity="neutral",
            targetAssetAmount=30_000_000,
            targetYears=3,
        )
        first = await generate_personal_roadmap(
            "fixed-target-user",
            PersonalRoadmapGenerateRequest(profile=profile, month="2026-08"),
            stored_profile={},
            dashboard_builder=_build_calculation_only_dashboard,
            repository=repository,
        )
        rolled = await generate_personal_roadmap(
            "fixed-target-user",
            PersonalRoadmapGenerateRequest(profile=profile, month="2026-09"),
            stored_profile={},
            dashboard_builder=_build_calculation_only_dashboard,
            repository=repository,
        )
        self.assertEqual(first.goal.targetMonth, "2029-08")
        self.assertEqual(rolled.goal.targetMonth, first.goal.targetMonth)
        self.assertEqual(first.longTermPlan.remainingMonths, 36)
        self.assertEqual(rolled.longTermPlan.remainingMonths, 35)
        self.assertEqual(rolled.period.end, "2029-08")
        self.assertEqual(len(rolled.months), 3)

    async def test_profile_created_at_anchors_goal_before_first_generation(self):
        profile = ProfileSnapshot(
            investmentPropensity="stable",
            targetAssetAmount=20_000_000,
            targetYears=3,
        )
        roadmap = await generate_personal_roadmap(
            "created-anchor-user",
            PersonalRoadmapGenerateRequest(profile=profile, month="2027-02", persist=False),
            stored_profile={"createdAt": "2026-08-15T09:00:00Z"},
            dashboard_builder=_build_calculation_only_dashboard,
            repository=PersonalRoadmapRepository(force_demo=True),
        )
        self.assertEqual(roadmap.goal.targetMonth, "2029-08")
        self.assertEqual(roadmap.longTermPlan.remainingMonths, 30)

    async def test_near_or_expired_target_does_not_create_future_segments(self):
        profile = ProfileSnapshot(
            investmentPropensity="stable",
            targetAssetAmount=20_000_000,
            targetYears=3,
        )
        near = await generate_personal_roadmap(
            "near-target-user",
            PersonalRoadmapGenerateRequest(
                profile=profile,
                month="2026-08",
                targetMonth="2026-10",
                persist=False,
            ),
            stored_profile={},
            dry_run=True,
        )
        expired = await generate_personal_roadmap(
            "expired-target-user",
            PersonalRoadmapGenerateRequest(
                profile=profile,
                month="2026-08",
                targetMonth="2026-07",
                persist=False,
            ),
            stored_profile={},
            dry_run=True,
        )
        self.assertEqual(near.longTermPlan.segments, [])
        self.assertEqual(near.longTermPlan.checkpoints[-1].month, "2026-10")
        self.assertEqual(expired.longTermPlan.remainingMonths, 0)
        self.assertTrue(expired.longTermPlan.targetReviewRequired)
        self.assertEqual(expired.longTermPlan.segments, [])


class LongTermPlanTests(unittest.TestCase):
    def _months(self, start: str = "2026-08"):
        financial_state = state()
        return generate_months(
            start,
            prioritize(build_candidates(financial_state, analyze_gap(financial_state))),
        )

    def test_segments_cover_month_four_to_target_without_exceeding_target(self):
        start = "2026-08"
        target = "2029-08"
        plan = build_long_term_plan(start, target, self._months(start))
        covered_offsets = []
        for segment in plan.segments:
            segment_start = month_distance(start, segment.startMonth)
            segment_end = month_distance(start, segment.endMonth)
            self.assertLessEqual(segment_end, month_distance(start, target))
            covered_offsets.extend(range(segment_start, segment_end + 1))
        self.assertEqual(covered_offsets, list(range(3, 37)))
        self.assertEqual(plan.checkpoints[-1].type, "TARGET_REVIEW")
        self.assertEqual(plan.checkpoints[-1].month, target)
        self.assertTrue(all(item.status == "PROVISIONAL" for item in plan.segments))

    def test_forty_year_plan_is_compact(self):
        start = "2026-08"
        target = add_months(start, 480)
        plan = build_long_term_plan(start, target, self._months(start))
        self.assertLess(len(plan.segments), 200)
        self.assertLess(len(plan.model_dump_json()), 200_000)
        self.assertEqual(plan.checkpoints[-1].month, target)


class IsolationTests(unittest.TestCase):
    def test_upcoming_products_and_external_ai_are_not_imported(self):
        package = Path(__file__).parents[1] / "app" / "personal_roadmap"
        source = "\n".join(path.read_text(encoding="utf-8") for path in package.glob("*.py"))
        for forbidden in ("upcoming_products", "upcoming-products", "boto3", "bedrock", "NAVER"):
            self.assertNotIn(forbidden, source)

    def test_invalid_calendar_month_is_rejected(self):
        with self.assertRaises(ValueError):
            PersonalRoadmapGenerateRequest(month="2026-13")


if __name__ == "__main__":
    unittest.main()
