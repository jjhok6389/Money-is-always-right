"""
Agent tool layer for the AI financial coach (기능 명세 5.3.2 서비스 기능 연계).

Each tool is a thin adapter over an existing service, so the agent calls real
business logic instead of receiving pre-stuffed prompt text. The Bedrock
tool-calling path and the keyword fallback path execute these same tools,
which keeps the agent demonstrable even without AWS credentials.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from app.models.dashboard import DashboardRequest, DashboardResponse
from app.models.knowledge import CATEGORY_LABELS, KnowledgeHit
from app.models.product import ProductListResponse, ProductType
from app.models.simulation import SimulationRequest
from app.services import dashboard_service, fss_client, knowledge_service, simulation_service

logger = logging.getLogger(__name__)

TOOL_LABELS = {
    "get_financial_state": "금융상태 조회",
    "search_products": "금융상품 탐색",
    "run_scenario_simulation": "시나리오 시뮬레이션",
    "get_roadmap": "로드맵 조회",
    "search_knowledge": "금융지식 검색",
}

# Onboarding does not collect assets/debt yet, so the dashboard estimates them.
ASSET_ESTIMATE_BASIS = "온보딩에 자산 입력 항목이 없어 월 저축 여력 기준으로 추정한 값입니다."


@dataclass
class AgentContext:
    """Per-request state so repeated tool calls reuse one dashboard/product fetch."""

    user_id: str
    profile: dict[str, Any]
    _dashboard: DashboardResponse | None = None
    _products: dict[str, ProductListResponse] = field(default_factory=dict)
    _knowledge: dict[tuple[str, str | None, int], list[KnowledgeHit]] = field(default_factory=dict)

    async def dashboard(self) -> DashboardResponse:
        if self._dashboard is None:
            self._dashboard = await dashboard_service.build_dashboard(
                self.user_id,
                self.profile,
                DashboardRequest(),
            )
        return self._dashboard

    async def products(self, product_type: ProductType) -> ProductListResponse:
        if product_type not in self._products:
            self._products[product_type] = await fss_client.fetch_products(product_type)
        return self._products[product_type]

    async def knowledge(
        self,
        query: str,
        category: str | None,
        limit: int,
    ) -> list[KnowledgeHit]:
        key = (query, category, limit)
        if key not in self._knowledge:
            self._knowledge[key] = await knowledge_service.search(query, category, limit)
        return self._knowledge[key]


# --- tool implementations -------------------------------------------------


async def _get_financial_state(_params: dict[str, Any], ctx: AgentContext) -> dict[str, Any]:
    data = await ctx.dashboard()
    goal = data.goal
    return {
        "month": data.month,
        "currentAssets": goal.currentAssets,
        "assetsEstimated": True,
        "assetsEstimateBasis": ASSET_ESTIMATE_BASIS,
        "targetAssetAmount": goal.targetAssetAmount,
        "gapAmount": goal.gapAmount,
        "achievementRate": goal.achievementRate,
        "monthlySavingsCapacity": goal.monthlySavingsCapacity,
        "estimatedMonthsToGoal": goal.estimatedMonthsToGoal,
        "estimatedAchievementDate": goal.estimatedAchievementDate,
        "onTrack": goal.onTrack,
        "targetYears": goal.targetYears,
        "portfolio": [
            {"label": item.label, "amount": item.amount, "ratio": item.ratio}
            for item in data.portfolio
        ],
        "consumptionTotals": data.consumptionTotals,
    }


async def _search_products(params: dict[str, Any], ctx: AgentContext) -> dict[str, Any]:
    product_type = params.get("productType")
    if product_type not in ("deposit", "saving"):
        product_type = "saving"
    limit = max(1, min(int(params.get("limit") or 3), 5))

    response = await ctx.products(product_type)
    ranked = sorted(response.products, key=lambda p: p.bestRate or 0, reverse=True)[:limit]
    return {
        "productType": product_type,
        "source": response.source,
        "count": len(ranked),
        "products": [
            {
                "companyName": product.companyName,
                "productName": product.productName,
                "bestRate": product.bestRate,
                "bestTermMonths": product.bestTermMonths,
                "joinWay": product.joinWay,
                "joinMember": product.joinMember,
                # 우대조건 원문은 길어서 프롬프트 비용이 큼. 앞부분만 전달.
                "spclCnd": (product.spclCnd or "")[:120],
            }
            for product in ranked
        ],
    }


def _scenario_updates(params: dict[str, Any], baseline) -> dict[str, Any]:
    updates: dict[str, Any] = {}
    if params.get("savingsRate") is not None:
        updates["savingsRate"] = min(max(float(params["savingsRate"]), 0), 100)
    elif params.get("savingsRateDelta") is not None:
        # "저축률을 10% 올리면" 처럼 증감으로 표현된 경우.
        target = baseline.savingsRate + float(params["savingsRateDelta"])
        updates["savingsRate"] = min(max(target, 0), 100)
    if params.get("annualInterestRate") is not None:
        updates["annualInterestRate"] = min(max(float(params["annualInterestRate"]), 0), 30)
    if params.get("monthlyIncomeDelta") is not None:
        updates["monthlyIncome"] = max(baseline.monthlyIncome + int(params["monthlyIncomeDelta"]), 0)
    if params.get("monthlyExpensesDelta") is not None:
        updates["monthlyExpenses"] = max(baseline.monthlyExpenses + int(params["monthlyExpensesDelta"]), 0)
    if params.get("horizonMonths") is not None:
        updates["horizonMonths"] = min(max(int(params["horizonMonths"]), 6), 480)
    return updates


async def _run_scenario_simulation(params: dict[str, Any], ctx: AgentContext) -> dict[str, Any]:
    baseline = simulation_service.assumptions_from_profile(ctx.profile)
    updates = _scenario_updates(params, baseline)
    scenario = baseline.model_copy(update=updates) if updates else baseline

    result = simulation_service.run_simulation(
        SimulationRequest(baseline=baseline, scenario=scenario, label="Agent 시나리오")
    )
    # trajectory 는 최대 481 포인트라 그대로 넘기면 토큰이 폭증함. 요약만 전달.
    return {
        "applied": updates or "변경 없음(현재 계획 유지)",
        "horizonMonths": scenario.horizonMonths,
        "targetAssetAmount": scenario.targetAssetAmount,
        "baseline": {
            "monthlyDeposit": result.baselineSummary.monthlyDeposit,
            "finalAssets": result.baselineSummary.finalAssets,
            "targetHitLabel": result.baselineSummary.targetHitLabel,
        },
        "scenario": {
            "monthlyDeposit": result.scenarioSummary.monthlyDeposit,
            "finalAssets": result.scenarioSummary.finalAssets,
            "targetHitLabel": result.scenarioSummary.targetHitLabel,
            "surplusVsBaseline": result.scenarioSummary.surplusVsBaseline,
        },
        "insights": result.insights,
    }


async def _get_roadmap(_params: dict[str, Any], ctx: AgentContext) -> dict[str, Any]:
    data = await ctx.dashboard()
    return {
        "steps": [
            {
                "priority": item.priority,
                "title": item.title,
                "detail": item.detail,
                "category": item.category,
            }
            for item in data.roadmap
        ],
        "debtRepaymentPriority": [
            {"priority": item.priority, "title": item.title, "detail": item.detail}
            for item in data.debtRepaymentPriority
        ],
    }


async def _search_knowledge(params: dict[str, Any], ctx: AgentContext) -> dict[str, Any]:
    query = str(params.get("query") or "").strip()
    if not query:
        return {"error": "검색어(query)가 필요합니다."}

    category = params.get("category")
    if category not in CATEGORY_LABELS:
        category = None
    limit = max(1, min(int(params.get("limit") or 3), 5))

    hits = await ctx.knowledge(query, category, limit)
    return {
        "query": query,
        "category": category,
        "matchType": hits[0].matchType if hits else None,
        # 하나라도 high 면 high. 전부 low 면 근거로 쓰기에 약하다는 신호.
        "bestConfidence": (
            "high" if any(hit.confidence == "high" for hit in hits) else "low"
        ) if hits else None,
        "count": len(hits),
        "documents": [
            {
                "title": hit.doc.title,
                "confidence": hit.confidence,
                "category": hit.doc.category,
                "text": hit.doc.text,
                "source": hit.doc.source,
                "updatedAt": hit.doc.updatedAt,
                "score": hit.score,
            }
            for hit in hits
        ],
    }


_HANDLERS: dict[str, Callable[[dict[str, Any], AgentContext], Awaitable[dict[str, Any]]]] = {
    "get_financial_state": _get_financial_state,
    "search_products": _search_products,
    "run_scenario_simulation": _run_scenario_simulation,
    "get_roadmap": _get_roadmap,
    "search_knowledge": _search_knowledge,
}


# --- Bedrock Converse toolConfig spec -------------------------------------

TOOL_SPECS: list[dict[str, Any]] = [
    {
        "toolSpec": {
            "name": "get_financial_state",
            "description": (
                "사용자의 현재 금융상태를 조회한다. 자산 구성, 목표 자산 대비 부족액과 달성률, "
                "월 저축 여력, 이번 달 소비 요약을 반환한다. 자산 금액은 추정값이다."
            ),
            "inputSchema": {"json": {"type": "object", "properties": {}}},
        }
    },
    {
        "toolSpec": {
            "name": "search_products",
            "description": "금융감독원 공시 예·적금 상품을 최고금리 순으로 검색한다.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "productType": {
                            "type": "string",
                            "enum": ["deposit", "saving"],
                            "description": "deposit=정기예금, saving=적금. 기본값 saving",
                        },
                        "limit": {"type": "integer", "description": "반환 개수 1~5, 기본값 3"},
                    },
                }
            },
        }
    },
    {
        "toolSpec": {
            "name": "run_scenario_simulation",
            "description": (
                "현재 계획(baseline)과 조건을 바꾼 시나리오의 미래 자산을 비교한다. "
                "소득·지출 변화, 저축률, 기대수익률, 기간을 바꿔 목표 달성 시점의 차이를 계산한다."
            ),
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "savingsRate": {
                            "type": "number",
                            "description": "잉여자금 대비 저축률을 이 값으로 고정 0~100(%)",
                        },
                        "savingsRateDelta": {
                            "type": "number",
                            "description": "현재 저축률 대비 증감(%p). 예: 10 은 10%p 인상",
                        },
                        "annualInterestRate": {"type": "number", "description": "기대 연 수익률 0~30(%)"},
                        "monthlyIncomeDelta": {
                            "type": "integer",
                            "description": "월 소득 증감액(원). 예: 500000",
                        },
                        "monthlyExpensesDelta": {
                            "type": "integer",
                            "description": "월 지출 증감액(원). 예: -200000",
                        },
                        "horizonMonths": {"type": "integer", "description": "시뮬레이션 기간(개월) 6~480"},
                    },
                }
            },
        }
    },
    {
        "toolSpec": {
            "name": "get_roadmap",
            "description": "사용자의 단계별 금융 실행 계획과 부채 상환 우선순위를 조회한다.",
            "inputSchema": {"json": {"type": "object", "properties": {}}},
        }
    },
    {
        "toolSpec": {
            "name": "search_knowledge",
            "description": (
                "금융 지식 문서를 검색한다. 상품 우대조건·가입대상 공시 원문, 청년 정책금융 자격요건, "
                "금융 용어 설명을 근거와 함께 돌려준다. 수치가 아닌 '조건·자격·의미'를 묻는 질문에 사용한다."
            ),
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "검색할 자연어 질의. 사용자 질문을 그대로 넣어도 된다.",
                        },
                        "category": {
                            "type": "string",
                            "enum": ["glossary", "policy", "product_terms"],
                            "description": (
                                "glossary=금융용어, policy=청년 정책금융, "
                                "product_terms=상품 공시조건. 생략하면 전체 검색"
                            ),
                        },
                        "limit": {"type": "integer", "description": "반환 문서 수 1~5, 기본값 3"},
                    },
                    "required": ["query"],
                }
            },
        }
    },
]


# --- execution ------------------------------------------------------------


async def execute(name: str, params: dict[str, Any], ctx: AgentContext) -> dict[str, Any]:
    """Run one tool. Errors are returned as data so the agent loop can continue."""
    handler = _HANDLERS.get(name)
    if handler is None:
        return {"error": f"알 수 없는 도구입니다: {name}"}
    try:
        return await handler(params or {}, ctx)
    except ValueError as exc:
        # build_dashboard raises this when the onboarding profile is missing.
        return {"error": str(exc)}
    except Exception as exc:
        logger.warning("agent tool %s failed: %s", name, exc)
        return {"error": f"도구 실행에 실패했습니다. ({exc})"}


def summarize(name: str, result: dict[str, Any]) -> str:
    """One-line Korean summary used by both the UI trace and the fallback reply."""
    if "error" in result:
        return str(result["error"])

    if name == "get_financial_state":
        return (
            f"추정 자산 {result['currentAssets']:,}원 · 달성률 {result['achievementRate']}% · "
            f"월 저축여력 {result['monthlySavingsCapacity']:,}원"
        )
    if name == "search_products":
        type_label = "예금" if result["productType"] == "deposit" else "적금"
        source_label = "금감원 공시" if result["source"] == "fss" else "모의 데이터"
        return f"{type_label} {result['count']}건 조회 ({source_label})"
    if name == "run_scenario_simulation":
        scenario = result["scenario"]
        return (
            f"시나리오 최종자산 {scenario['finalAssets']:,}원 "
            f"(기준 대비 {scenario['surplusVsBaseline']:+,}원)"
        )
    if name == "get_roadmap":
        return f"실행 단계 {len(result['steps'])}개 · 부채 항목 {len(result['debtRepaymentPriority'])}개"
    if name == "search_knowledge":
        if not result["count"]:
            return f"'{result['query']}' 관련 문서를 찾지 못했습니다."
        scope = CATEGORY_LABELS.get(result["category"] or "", "전체")
        mode = {"both": "벡터+키워드", "vector": "벡터", "keyword": "키워드"}.get(
            result["matchType"], "검색"
        )
        note = "" if result["bestConfidence"] == "high" else ", 신뢰도 낮음"
        return f"{scope} 문서 {result['count']}건 ({mode}{note})"
    return "완료"
