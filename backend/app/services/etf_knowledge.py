"""
Bedrock Knowledge Base retrieve for ETF explanations. Numbers never come from here.
"""

from __future__ import annotations

import logging
from typing import Any

from app.config import get_settings
from app.services import etf_store

logger = logging.getLogger(__name__)

_GLOSSARY_FALLBACK = [
    {
        "title": "ETF",
        "text": "거래소에 상장되어 주식처럼 사고팔 수 있는 펀드입니다.",
    },
    {
        "title": "6개월 변동성",
        "text": "최근 약 126 영업일 종가 수익률의 연율화 표준편차입니다. 과거 출렁임 비교용이며 미래 수익이 아닙니다.",
    },
    {
        "title": "레버리지",
        "text": "하루 수익률의 배수를 추종합니다. 여러 날 보유하면 지수 누적 수익의 배수가 되지 않을 수 있습니다.",
    },
    {
        "title": "NAV",
        "text": "펀드 순자산을 좌수로 나눈 가치입니다. 시장 가격과 차이가 날 수 있습니다.",
    },
]


def _policy_chunks(propensity: str | None) -> list[dict[str, str]]:
    policy = etf_store.get_policy()
    messages = policy.get("messages") or etf_store.POLICY_KO
    chunks = [
        {"title": "면책", "text": messages.get("disclaimer", "")},
        {"title": "안정형 정책", "text": messages.get("stable", "")},
    ]
    if propensity and propensity in messages:
        chunks.append({"title": "사용자 성향 정책", "text": messages[propensity]})
    return chunks


def _local_retrieve(query: str, propensity: str | None) -> list[dict[str, str]]:
    lowered = (query or "").lower()
    hits: list[dict[str, str]] = []
    for item in _GLOSSARY_FALLBACK:
        blob = (item["title"] + item["text"]).lower()
        if any(token in blob for token in lowered.replace("?", " ").split() if len(token) >= 2):
            hits.append(item)
    if "레버리지" in query:
        hits = [item for item in _GLOSSARY_FALLBACK if item["title"] == "레버리지"] or hits
    if not hits:
        hits = _GLOSSARY_FALLBACK[:2]
    hits.extend(_policy_chunks(propensity))
    return hits[:6]


def retrieve_etf_knowledge(query: str, propensity: str | None = None) -> dict[str, Any]:
    settings = get_settings()
    kb_id = (getattr(settings, "bedrock_knowledge_base_id", None) or "").strip()
    if propensity == "stable":
        policy = etf_store.POLICY_KO["stable"]
        return {
            "source": "policy",
            "chunks": [
                {"title": "안정형 정책", "text": policy},
                {"title": "면책", "text": etf_store.POLICY_KO["disclaimer"]},
            ],
            "message": policy,
        }

    if not kb_id:
        return {
            "source": "fallback",
            "chunks": _local_retrieve(query, propensity),
            "message": "Bedrock Knowledge Base ID가 없어 로컬 정책·용어로 안내합니다.",
        }

    try:
        import boto3

        client_kwargs: dict[str, Any] = {"region_name": settings.aws_region}
        if settings.aws_access_key_id and settings.aws_secret_access_key:
            client_kwargs["aws_access_key_id"] = settings.aws_access_key_id
            client_kwargs["aws_secret_access_key"] = settings.aws_secret_access_key
        client = boto3.client("bedrock-agent-runtime", **client_kwargs)
        response = client.retrieve(
            knowledgeBaseId=kb_id,
            retrievalQuery={"text": query or "ETF 추천 정책"},
            retrievalConfiguration={"vectorSearchConfiguration": {"numberOfResults": 5}},
        )
        chunks: list[dict[str, str]] = []
        for item in response.get("retrievalResults") or []:
            content = (item.get("content") or {}).get("text") or ""
            location = item.get("location") or {}
            title = (
                (location.get("s3Location") or {}).get("uri")
                or (item.get("metadata") or {}).get("title")
                or "kb"
            )
            if content:
                chunks.append({"title": str(title), "text": content[:1200]})
        if propensity == "stable":
            chunks = [c for c in chunks if "고변동" not in c["text"] and "레버리지" not in c["text"]]
        if not chunks:
            return {
                "source": "fallback",
                "chunks": _local_retrieve(query, propensity),
                "message": "KB 검색 결과가 없어 로컬 용어로 안내합니다.",
            }
        return {"source": "bedrock_kb", "chunks": chunks, "message": None}
    except Exception as exc:
        logger.warning("Bedrock KB retrieve failed: %s", exc)
        return {
            "source": "fallback",
            "chunks": _local_retrieve(query, propensity),
            "message": f"KB 조회에 실패해 로컬 정책·용어로 안내합니다. ({exc})",
        }
