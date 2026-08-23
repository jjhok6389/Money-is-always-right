"""
AI financial coach agent (기능 명세 5.3 AI 에이전트).

Flow:
  React chatbot -> FastAPI /api/coach/chat
                -> orchestrator picks tools
                   * Bedrock Converse toolConfig loop   (AWS 키 있음)
                   * keyword routing                    (키 없음/호출 실패)
                -> agent_tools executes real services
                -> natural-language reply + tool trace

Both paths run the same tools, so the agent stays demonstrable without AWS keys.
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

import boto3

from app.config import get_settings
from app.models.coach import ChatMessage, CoachChatRequest, CoachChatResponse, ToolTrace
from app.services import agent_tools, firebase_service

logger = logging.getLogger(__name__)

# Guard against a model that keeps requesting tools without answering.
MAX_TOOL_ITERATIONS = 4

PROPENSITY_KO = {
    "stable": "안정형",
    "stable_seeking": "안정추구형",
    "neutral": "위험중립형",
    "aggressive": "적극투자형",
    "very_aggressive": "공격투자형",
}

SUGGESTIONS = [
    "내 목표 달성까지 얼마나 걸릴까?",
    "안정형에게 맞는 적금 추천해줘",
    "저축률을 10% 올리면 어떻게 될까?",
    "대출을 먼저 갚는 게 나을까?",
]

SYSTEM_PROMPT = """당신은 'Money is Always Right'의 청년 자산형성 AI 에이전트입니다.
반드시 자연스러운 한국어로만 답변하세요.

당신은 도구(tool)를 사용해 사용자의 실제 금융 데이터를 조회할 수 있습니다.
추측하지 말고, 수치가 필요하면 반드시 도구를 먼저 호출하세요.
- 자산·목표 달성률·저축 여력이 필요하면 get_financial_state
- 예·적금·연금저축 상품이 필요하면 search_products
- '만약 ~하면' 같은 가정이 나오면 run_scenario_simulation
- 실행 순서·부채 상환 우선순위가 필요하면 get_roadmap
필요하면 여러 도구를 연달아 호출한 뒤 종합해서 답하세요.

규칙:
1) 투자 권유처럼 단정하지 말고, 정보 제공·의사결정 보조 관점으로 말합니다.
2) 숫자는 원 단위로 읽기 쉽게 쓰고, 도구가 돌려준 값만 사용합니다.
3) 답변은 3~6문장 정도로 간결하게, 필요하면 짧은 불릿을 사용합니다.
4) 자산 금액은 추정값입니다. 확정된 사실처럼 말하지 말고 추정임을 밝히세요.
5) 모르는 개인신용/세금 세부는 일반론으로 안내하고 전문가 상담을 권합니다.
6) 투자 성향은 안정형 < 안정추구형 < 위험중립형 < 적극투자형 < 공격투자형 순으로 위험 수용도가 높습니다.
   사용자의 성향보다 위험이 큰 상품은 권하지 않습니다.
7) 상품 가입을 대신 실행할 수는 없습니다. 비교와 설명까지만 제공합니다.
"""


def _build_context_block(profile: dict[str, Any] | None) -> str:
    """Identity only. Amounts and product data come from tools, not the prompt."""
    profile = profile or {}
    propensity = PROPENSITY_KO.get(
        profile.get("investmentPropensity"),
        profile.get("investmentPropensity") or "-",
    )
    return "\n".join(
        [
            "[사용자 프로필]",
            f"- 이름: {profile.get('displayName') or '회원'}",
            f"- 나이/직업: {profile.get('age') or '-'} / {profile.get('occupation') or '-'}",
            f"- 투자 성향: {propensity}",
            f"- 목표: {profile.get('goalDescription') or '-'}",
            f"- 목표 기간: {profile.get('targetYears') or '-'}년",
        ]
    )


def _trace(name: str, result: dict[str, Any]) -> ToolTrace:
    return ToolTrace(
        name=name,
        label=agent_tools.TOOL_LABELS.get(name, name),
        status="error" if "error" in result else "ok",
        summary=agent_tools.summarize(name, result),
    )


# --- Bedrock tool-calling path -------------------------------------------


def _history_to_bedrock(history: list[ChatMessage]) -> list[dict[str, Any]]:
    """Converse requires the turn list to start with a user message."""
    items = list(history[-12:])
    while items and items[0].role != "user":
        items.pop(0)
    return [{"role": item.role, "content": [{"text": item.content}]} for item in items]


def _bedrock_client():
    settings = get_settings()
    client_kwargs: dict[str, Any] = {"region_name": settings.aws_region}
    if settings.aws_access_key_id and settings.aws_secret_access_key:
        client_kwargs["aws_access_key_id"] = settings.aws_access_key_id
        client_kwargs["aws_secret_access_key"] = settings.aws_secret_access_key
    return boto3.client("bedrock-runtime", **client_kwargs)


async def _run_bedrock_agent(
    system: str,
    history: list[ChatMessage],
    message: str,
    ctx: agent_tools.AgentContext,
) -> tuple[str, list[ToolTrace]]:
    settings = get_settings()
    client = _bedrock_client()

    messages = _history_to_bedrock(history)
    messages.append({"role": "user", "content": [{"text": message}]})
    traces: list[ToolTrace] = []

    for _ in range(MAX_TOOL_ITERATIONS):
        # boto3 is blocking; keep the event loop free so tools can stay async.
        response = await asyncio.to_thread(
            client.converse,
            modelId=settings.bedrock_model_id,
            system=[{"text": system}],
            messages=messages,
            toolConfig={"tools": agent_tools.TOOL_SPECS},
            inferenceConfig={
                "maxTokens": settings.bedrock_max_tokens,
                "temperature": 0.4,
            },
        )
        content = response.get("output", {}).get("message", {}).get("content", [])

        if response.get("stopReason") != "tool_use":
            text = "".join(part.get("text", "") for part in content if "text" in part).strip()
            if not text:
                raise RuntimeError("Empty Bedrock response")
            return text, traces

        messages.append({"role": "assistant", "content": content})

        tool_results: list[dict[str, Any]] = []
        for block in content:
            use = block.get("toolUse")
            if not use:
                continue
            name = use.get("name", "")
            result = await agent_tools.execute(name, use.get("input") or {}, ctx)
            traces.append(_trace(name, result))
            tool_results.append(
                {
                    "toolResult": {
                        "toolUseId": use.get("toolUseId"),
                        "content": [{"json": result}],
                        "status": "error" if "error" in result else "success",
                    }
                }
            )

        if not tool_results:
            raise RuntimeError("tool_use stop reason without a toolUse block")
        messages.append({"role": "user", "content": tool_results})

    raise RuntimeError(f"도구 호출이 {MAX_TOOL_ITERATIONS}회를 초과했습니다.")


# --- Keyword routing fallback --------------------------------------------

ROUTING_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("run_scenario_simulation", ("시나리오", "만약", "올리면", "늘리면", "줄이면", "시뮬", "바꾸면", "오르면")),
    ("search_products", ("적금", "예금", "연금", "상품", "추천", "비교", "금리", "가입")),
    ("get_roadmap", ("로드맵", "계획", "순서", "부채", "대출", "상환", "우선")),
    ("get_financial_state", ("목표", "달성", "기간", "얼마나", "자산", "저축", "소비", "현황")),
]

_AMOUNT_PATTERN = re.compile(r"(\d+)\s*만\s*원")
_PERCENT_PATTERN = re.compile(r"(\d+(?:\.\d+)?)\s*%")


def _route_tools(message: str) -> list[str]:
    """Pick tools by keyword when the model cannot plan for us. Max 2 per turn."""
    selected = [name for name, keywords in ROUTING_RULES if any(key in message for key in keywords)]
    return selected[:2] or ["get_financial_state"]


def _fallback_params(name: str, message: str) -> dict[str, Any]:
    if name == "search_products":
        if "연금" in message:
            product_type = "annuity"
        elif "예금" in message:
            product_type = "deposit"
        else:
            product_type = "saving"
        return {"productType": product_type, "limit": 3}

    if name == "run_scenario_simulation":
        params: dict[str, Any] = {}
        percent = _PERCENT_PATTERN.search(message)
        if percent:
            value = float(percent.group(1))
            # "10% 올리면"은 증감, "저축률 10%로"는 고정값으로 해석.
            if any(key in message for key in ("올리", "늘리", "높이", "더")):
                params["savingsRateDelta"] = value
            elif any(key in message for key in ("낮추", "내리", "줄이")):
                params["savingsRateDelta"] = -value
            else:
                params["savingsRate"] = value
        amount = _AMOUNT_PATTERN.search(message)
        if amount:
            won = int(amount.group(1)) * 10000
            if any(key in message for key in ("줄이", "절약", "아끼")):
                params["monthlyExpensesDelta"] = -won
            else:
                params["monthlyIncomeDelta"] = won
        return params

    return {}


def _format_state_reply(name_ko: str, result: dict[str, Any]) -> str:
    months = result.get("estimatedMonthsToGoal")
    when = result.get("estimatedAchievementDate")
    lines = [
        f"{name_ko}님의 현재 추정 자산은 {result['currentAssets']:,}원이고, "
        f"목표 {result['targetAssetAmount']:,}원까지 {result['gapAmount']:,}원이 남았어요 "
        f"(달성률 {result['achievementRate']}%).",
        f"월 저축 여력은 {result['monthlySavingsCapacity']:,}원으로 계산됩니다.",
    ]
    if months:
        lines.append(f"이 속도라면 약 {months}개월 뒤인 {when or '-'}쯤 목표에 도달할 수 있어요.")
    else:
        lines.append("현재 저축 여력으로는 목표 도달 시점을 계산하기 어려워요. 지출부터 점검해 보세요.")
    lines.append(f"※ 자산 금액은 {agent_tools.ASSET_ESTIMATE_BASIS}")
    return " ".join(lines)


def _format_products_reply(result: dict[str, Any]) -> str:
    products = result.get("products") or []
    if not products:
        return "지금은 상품 목록을 불러오지 못했어요. 예·적금 메뉴에서 공시 상품을 먼저 확인해 주세요."

    top = products[0]
    reply = (
        f"금리 순으로는 '{top['companyName']} {top['productName']}'"
        f"(최고금리 {top['bestRate']}%)이 가장 앞섭니다. "
    )
    if len(products) > 1:
        second = products[1]
        reply += (
            f"비교 후보로 '{second['companyName']} {second['productName']}'"
            f"({second['bestRate']}%)도 있어요. "
        )
    if result.get("source") == "mock":
        reply += "(금감원 API 키가 없어 모의 상품 데이터로 안내 중입니다.) "
    reply += "가입 전 우대조건·중도해지이율을 꼭 확인하세요."
    return reply


def _format_simulation_reply(result: dict[str, Any]) -> str:
    baseline = result["baseline"]
    scenario = result["scenario"]
    reply = (
        f"현재 계획대로면 {result['horizonMonths']}개월 뒤 자산은 약 {baseline['finalAssets']:,}원, "
        f"조건을 바꾼 시나리오에서는 약 {scenario['finalAssets']:,}원으로 "
        f"{scenario['surplusVsBaseline']:+,}원 차이가 납니다. "
    )
    if scenario.get("targetHitLabel"):
        reply += f"목표 도달 예상 시점은 {scenario['targetHitLabel']}입니다. "
    insights = result.get("insights") or []
    if insights:
        reply += insights[0]
    return reply


def _format_roadmap_reply(result: dict[str, Any]) -> str:
    steps = result.get("steps") or []
    debts = result.get("debtRepaymentPriority") or []
    if not steps and not debts:
        return "아직 로드맵을 만들 정보가 부족해요. 온보딩에서 소득·지출·목표를 먼저 채워 주세요."

    reply = ""
    if steps:
        titles = " → ".join(step["title"] for step in steps[:3])
        reply += f"실행 순서는 {titles} 순으로 잡는 것을 권합니다. "
    if debts:
        reply += f"부채는 '{debts[0]['title']}'부터 처리하는 편이 유리해요. {debts[0]['detail']} "
    else:
        reply += "등록된 부채 정보가 없어 상환 우선순위는 계산하지 않았어요. "
    return reply.strip()


_FORMATTERS = {
    "search_products": _format_products_reply,
    "run_scenario_simulation": _format_simulation_reply,
    "get_roadmap": _format_roadmap_reply,
}


async def _run_fallback_agent(
    message: str,
    ctx: agent_tools.AgentContext,
) -> tuple[str, list[ToolTrace]]:
    name_ko = (ctx.profile or {}).get("displayName") or "회원"
    traces: list[ToolTrace] = []
    parts: list[str] = []

    for name in _route_tools(message):
        result = await agent_tools.execute(name, _fallback_params(name, message), ctx)
        traces.append(_trace(name, result))

        if "error" in result:
            parts.append(str(result["error"]))
        elif name == "get_financial_state":
            parts.append(_format_state_reply(name_ko, result))
        else:
            parts.append(_FORMATTERS[name](result))

    parts.append("(AWS Bedrock 응답을 사용할 수 없어 로컬 도구 실행 결과로 안내 중입니다.)")
    return " ".join(parts), traces


# --- entrypoint -----------------------------------------------------------


async def chat(user_id: str, request: CoachChatRequest) -> CoachChatResponse:
    settings = get_settings()
    stored = firebase_service.get_user_document(user_id) or {}
    profile = {**stored, **(request.profile or {})}
    ctx = agent_tools.AgentContext(user_id=user_id, profile=profile)
    system = f"{SYSTEM_PROMPT}\n\n{_build_context_block(profile)}"

    try:
        reply, traces = await _run_bedrock_agent(system, request.history, request.message, ctx)
        return CoachChatResponse(
            reply=reply,
            source="bedrock",
            modelId=settings.bedrock_model_id,
            suggestions=SUGGESTIONS,
            toolTrace=traces,
        )
    except Exception as exc:
        if not settings.bedrock_fallback_enabled:
            raise
        logger.warning("Bedrock agent failed, falling back to keyword routing: %s", exc)

    reply, traces = await _run_fallback_agent(request.message, ctx)
    return CoachChatResponse(
        reply=reply,
        source="fallback",
        modelId=None,
        suggestions=SUGGESTIONS,
        toolTrace=traces,
    )
