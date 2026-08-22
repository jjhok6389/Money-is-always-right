"""
AWS Bedrock-backed AI financial coach.

Flow:
  React chatbot -> FastAPI /api/coach/chat
                -> build Korean system prompt with user financial context
                -> Bedrock Converse (Claude) OR local fallback coach
"""

from __future__ import annotations

import json
from typing import Any

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app.config import get_settings
from app.models.coach import ChatMessage, CoachChatRequest, CoachChatResponse
from app.services import fss_client, firebase_service, transaction_pipeline

PROPENSITY_KO = {
    "stable": "안정형",
    "neutral": "중립형",
    "aggressive": "적극형",
}

SUGGESTIONS = [
    "내 목표 달성까지 얼마나 걸릴까?",
    "안정형에게 맞는 적금 추천해줘",
    "변동비를 줄이려면 어디부터 줄일까?",
    "예금이랑 적금 중 뭐가 나을까?",
]


def _build_context_block(
    profile: dict[str, Any] | None,
    dashboard_hints: dict[str, Any] | None,
    tx_summary: dict[str, Any] | None,
    products: list[dict[str, Any]],
) -> str:
    profile = profile or {}
    dashboard_hints = dashboard_hints or {}
    tx_summary = tx_summary or {}

    lines = [
        "[사용자 프로필]",
        f"- 이름: {profile.get('displayName') or '회원'}",
        f"- 나이/직업: {profile.get('age') or '-'} / {profile.get('occupation') or '-'}",
        f"- 월 소득: {int(profile.get('monthlyIncome') or 0):,}원",
        f"- 고정 지출: {int(profile.get('fixedExpenses') or 0):,}원",
        f"- 예상 월 저축: {int(profile.get('estimatedMonthlySavings') or 0):,}원",
        f"- 투자 성향: {PROPENSITY_KO.get(profile.get('investmentPropensity'), profile.get('investmentPropensity') or '-')}",
        f"- 목표 자산: {int(profile.get('targetAssetAmount') or 0):,}원 / {profile.get('targetYears') or '-'}년",
        f"- 목표 설명: {profile.get('goalDescription') or '-'}",
        "",
        "[대시보드 힌트]",
        json.dumps(dashboard_hints, ensure_ascii=False) if dashboard_hints else "- 없음",
        "",
        "[이번 달 소비 요약]",
        (
            f"- 소득 {int(tx_summary.get('income') or 0):,}원 / "
            f"고정비 {int(tx_summary.get('fixedExpenses') or 0):,}원 / "
            f"변동비 {int(tx_summary.get('variableExpenses') or 0):,}원 / "
            f"순현금흐름 {int(tx_summary.get('netCashflow') or 0):,}원"
            if tx_summary
            else "- 없음"
        ),
        "",
        "[추천 후보 상품(상위)]",
    ]
    if products:
        for product in products[:5]:
            lines.append(
                f"- {product.get('companyName')} {product.get('productName')} "
                f"({product.get('productType')}) 최고금리 {product.get('bestRate')}%"
            )
    else:
        lines.append("- 없음")
    return "\n".join(lines)


SYSTEM_PROMPT = """당신은 'Money is Always Right'의 AI 금융 코치입니다.
반드시 자연스러운 한국어로만 답변하세요.
사용자의 프로필, 소비 요약, 목표 로드맵, 예·적금 후보를 참고해
상품 비교, 가입 적합성, 로드맵 실행 조언을 구체적이고 친절하게 제공합니다.

규칙:
1) 투자 권유처럼 단정하지 말고, 정보 제공·의사결정 보조 관점으로 말합니다.
2) 숫자는 원 단위로 읽기 쉽게 씁니다.
3) 답변은 3~6문장 정도로 간결하게, 필요하면 짧은 불릿을 사용합니다.
4) 모르는 개인신용/세금 세부는 일반론으로 안내하고 전문가 상담을 권합니다.
5) 사용자의 투자 성향(안정형/중립형/적극형)을 존중합니다.
"""


def _fallback_reply(message: str, profile: dict[str, Any] | None, products: list[dict[str, Any]]) -> str:
    profile = profile or {}
    name = profile.get("displayName") or "회원"
    savings = int(profile.get("estimatedMonthlySavings") or 0)
    target = int(profile.get("targetAssetAmount") or 0)
    years = int(profile.get("targetYears") or 0)
    propensity = PROPENSITY_KO.get(profile.get("investmentPropensity"), "중립형")

    if any(key in message for key in ("목표", "달성", "기간", "얼마나")):
        if savings > 0 and target > 0:
            months = (target + savings - 1) // savings
            return (
                f"{name}님, 현재 예상 월 저축 {savings:,}원 기준으로 목표 {target:,}원까지 "
                f"약 {months}개월이 걸릴 수 있어요. "
                f"설정하신 목표 기간은 {years}년입니다. "
                f"시뮬레이션 화면에서 저축률·금리를 바꿔 궤적을 비교해 보세요."
            )
        return f"{name}님, 목표 자산과 월 저축 여력을 온보딩에서 먼저 확인해 주세요."

    if any(key in message for key in ("적금", "예금", "상품", "추천", "비교")):
        if products:
            top = products[0]
            second = products[1] if len(products) > 1 else None
            reply = (
                f"{propensity} 성향 기준으로는 '{top.get('companyName')} {top.get('productName')}'"
                f"(최고금리 {top.get('bestRate')}%)을 먼저 살펴보시면 좋아요. "
            )
            if second:
                reply += (
                    f"비교 후보로는 '{second.get('companyName')} {second.get('productName')}'"
                    f"({second.get('bestRate')}%)도 있습니다. "
                )
            reply += "가입 전 우대조건·중도해지이율을 꼭 확인하세요."
            return reply
        return "지금은 상품 목록을 불러오지 못했어요. 예·적금 메뉴에서 공시 상품을 먼저 확인해 주세요."

    if any(key in message for key in ("변동", "소비", "절약", "줄이")):
        return (
            f"{name}님, 변동비는 식비·쇼핑·구독부터 10%씩 줄이는 게 실행하기 쉬워요. "
            f"절약한 금액은 자동이체 적금으로 바로 옮기면 로드맵 달성률이 안정됩니다."
        )

    if any(key in message for key in ("부채", "대출", "상환")):
        return (
            "고금리 부채가 있다면 저축보다 상환을 우선하는 편이 유리한 경우가 많아요. "
            "대시보드의 부채 상환 우선순위를 참고하고, 금리가 낮은 대환 가능 여부도 함께 점검해 보세요."
        )

    return (
        f"{name}님, 저는 상품 비교·목표 달성·소비 실행을 돕는 AI 금융 코치예요. "
        f"예: '적금 추천해줘', '목표까지 얼마나 걸려?', '변동비 줄이는 법'처럼 물어보시면 됩니다. "
        f"(현재 AWS Bedrock 키가 없어 로컬 안내 모드로 답변 중입니다.)"
    )


def _history_to_bedrock(history: list[ChatMessage]) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = []
    for item in history[-12:]:
        messages.append(
            {
                "role": item.role,
                "content": [{"text": item.content}],
            }
        )
    return messages


def _call_bedrock(system: str, history: list[ChatMessage], user_message: str) -> tuple[str, str]:
    settings = get_settings()
    client_kwargs: dict[str, Any] = {"region_name": settings.aws_region}
    if settings.aws_access_key_id and settings.aws_secret_access_key:
        client_kwargs["aws_access_key_id"] = settings.aws_access_key_id
        client_kwargs["aws_secret_access_key"] = settings.aws_secret_access_key

    client = boto3.client("bedrock-runtime", **client_kwargs)
    messages = _history_to_bedrock(history)
    messages.append({"role": "user", "content": [{"text": user_message}]})

    response = client.converse(
        modelId=settings.bedrock_model_id,
        system=[{"text": system}],
        messages=messages,
        inferenceConfig={
            "maxTokens": settings.bedrock_max_tokens,
            "temperature": 0.4,
        },
    )
    parts = response.get("output", {}).get("message", {}).get("content", [])
    text = "".join(part.get("text", "") for part in parts if "text" in part).strip()
    if not text:
        raise RuntimeError("Empty Bedrock response")
    return text, settings.bedrock_model_id


async def _load_products() -> list[dict[str, Any]]:
    saving = await fss_client.fetch_products("saving")
    deposit = await fss_client.fetch_products("deposit")
    mixed = list(saving.products[:3]) + list(deposit.products[:2])
    return [product.model_dump() for product in mixed]


async def chat(user_id: str, request: CoachChatRequest) -> CoachChatResponse:
    settings = get_settings()
    stored = firebase_service.get_user_document(user_id) or {}
    profile = {**stored, **(request.profile or {})}

    pipeline = transaction_pipeline.run_pipeline(user_id=user_id, count=40)
    products = await _load_products()
    context = _build_context_block(
        profile,
        request.dashboardHints,
        pipeline.totals,
        products,
    )
    system = f"{SYSTEM_PROMPT}\n\n{context}"

    try:
        reply, model_id = _call_bedrock(system, request.history, request.message)
        return CoachChatResponse(
            reply=reply,
            source="bedrock",
            modelId=model_id,
            suggestions=SUGGESTIONS,
        )
    except (BotoCoreError, ClientError, Exception):
        if not settings.bedrock_fallback_enabled:
            raise
        reply = _fallback_reply(request.message, profile, products)
        return CoachChatResponse(
            reply=reply,
            source="fallback",
            modelId=None,
            suggestions=SUGGESTIONS,
        )
