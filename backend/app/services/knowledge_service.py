"""
Knowledge retrieval for the AI coach (YP2026-59 RAG 기반 작업).

Corpus  : backend/data/knowledge/*.jsonl   (사람이 편집하는 원문, 1줄 = 1문서)
Index   : backend/data/knowledge_index.json (scripts/build_knowledge_index.py 산출물)

검색 경로는 두 가지이고, 코드베이스의 "키 없어도 동작한다" 불변식을 따른다.
  * 인덱스에 벡터가 있고 Bedrock 호출이 성공하면  -> 코사인 유사도 (matchType="vector")
  * 그 외 모든 경우                                -> 토큰 겹침 키워드 검색 (matchType="keyword")

문서 수가 수백 건 규모라 numpy/faiss 없이 순수 파이썬으로 충분하다.
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

import boto3

from app.config import get_settings
from app.models.knowledge import IndexedDoc, KnowledgeCategory, KnowledgeDoc, KnowledgeHit

logger = logging.getLogger(__name__)

_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
CORPUS_DIR = _BACKEND_DIR / "data" / "knowledge"
DEFAULT_INDEX_PATH = _BACKEND_DIR / "data" / "knowledge_index.json"

# 임베딩 대상 텍스트 상한. 초과하면 인제스트에서 개행 기준으로 분할한다.
MAX_DOC_CHARS = 1500

# 한글/영숫자 토큰. 한국어는 조사가 붙어 완전일치가 잘 안 되므로 2-gram 도 함께 쓴다.
_TOKEN_PATTERN = re.compile(r"[0-9A-Za-z가-힣]+")


def index_path() -> Path:
    configured = get_settings().knowledge_index_path
    return Path(configured) if configured else DEFAULT_INDEX_PATH


# --- Bedrock embeddings ---------------------------------------------------


def _bedrock_client():
    settings = get_settings()
    client_kwargs: dict[str, Any] = {"region_name": settings.aws_region}
    if settings.aws_access_key_id and settings.aws_secret_access_key:
        client_kwargs["aws_access_key_id"] = settings.aws_access_key_id
        client_kwargs["aws_secret_access_key"] = settings.aws_secret_access_key
    return boto3.client("bedrock-runtime", **client_kwargs)


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Titan 임베딩은 배치 입력을 받지 않으므로 한 건씩 호출한다 (인제스트 전용)."""
    settings = get_settings()
    client = _bedrock_client()
    vectors: list[list[float]] = []

    for text in texts:
        response = client.invoke_model(
            modelId=settings.bedrock_embedding_model_id,
            body=json.dumps(
                {
                    "inputText": text[:MAX_DOC_CHARS],
                    "dimensions": settings.bedrock_embedding_dimensions,
                    "normalize": True,
                }
            ),
        )
        payload = json.loads(response["body"].read())
        vectors.append(payload["embedding"])

    return vectors


# --- index loading --------------------------------------------------------


@lru_cache
def _load_index() -> tuple[IndexedDoc, ...]:
    """인덱스 파일이 없거나 깨져 있으면 빈 튜플. 호출부는 코퍼스 원문으로 폴백한다."""
    path = index_path()
    if not path.exists():
        return ()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        return tuple(IndexedDoc.model_validate(item) for item in raw.get("docs", []))
    except Exception as exc:
        logger.warning("knowledge index load failed (%s): %s", path, exc)
        return ()


@lru_cache
def _load_corpus() -> tuple[IndexedDoc, ...]:
    """인덱스가 없을 때 쓰는 원문 코퍼스. 벡터가 없으므로 키워드 검색만 가능하다."""
    docs: list[IndexedDoc] = []
    if not CORPUS_DIR.exists():
        return ()
    for path in sorted(CORPUS_DIR.glob("*.jsonl")):
        docs.extend(IndexedDoc.model_validate(doc.model_dump()) for doc in read_corpus_file(path))
    return tuple(docs)


def read_corpus_file(path: Path) -> list[KnowledgeDoc]:
    """JSONL 한 파일을 읽는다. 빈 줄과 '#' 주석 줄은 건너뛴다."""
    docs: list[KnowledgeDoc] = []
    for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        try:
            docs.append(KnowledgeDoc.model_validate_json(line))
        except Exception as exc:
            logger.warning("skipping %s:%d — %s", path.name, lineno, exc)
    return docs


def _documents() -> tuple[IndexedDoc, ...]:
    return _load_index() or _load_corpus()


def reset_cache() -> None:
    """인덱스를 다시 빌드한 뒤 재기동 없이 반영하고 싶을 때 사용."""
    _load_index.cache_clear()
    _load_corpus.cache_clear()


# --- scoring --------------------------------------------------------------


def _tokens(text: str) -> set[str]:
    words = _TOKEN_PATTERN.findall(text.lower())
    grams: set[str] = set(words)
    for word in words:
        # 조사·어미 때문에 완전일치가 어려운 한국어를 위해 2-gram 을 추가한다.
        grams.update(word[i : i + 2] for i in range(len(word) - 1))
    return grams


def _cosine(left: list[float], right: list[float]) -> float:
    dot = sum(a * b for a, b in zip(left, right))
    norm = math.sqrt(sum(a * a for a in left)) * math.sqrt(sum(b * b for b in right))
    return dot / norm if norm else 0.0


def _keyword_score(query_tokens: set[str], doc: KnowledgeDoc) -> float:
    if not query_tokens:
        return 0.0
    # 제목·태그는 문서의 주제를 직접 나타내므로 본문보다 크게 가중한다.
    head = _tokens(f"{doc.title} {' '.join(doc.tags)}")
    body = _tokens(doc.text)
    hits = 3.0 * len(query_tokens & head) + len(query_tokens & body)
    return hits / (3.0 * len(query_tokens))


def _candidates(category: KnowledgeCategory | None) -> list[IndexedDoc]:
    docs = _documents()
    if category:
        return [doc for doc in docs if doc.category == category]
    return list(docs)


def _keyword_search(
    query: str,
    category: KnowledgeCategory | None,
    limit: int,
) -> list[KnowledgeHit]:
    query_tokens = _tokens(query)
    scored = [
        (_keyword_score(query_tokens, doc), doc)
        for doc in _candidates(category)
    ]
    scored = [item for item in scored if item[0] > 0]
    scored.sort(key=lambda item: item[0], reverse=True)
    return [
        KnowledgeHit(doc=KnowledgeDoc.model_validate(doc.model_dump(exclude={"vector"})),
                     score=round(score, 4),
                     matchType="keyword")
        for score, doc in scored[:limit]
    ]


def _vector_search(
    query_vector: list[float],
    category: KnowledgeCategory | None,
    limit: int,
) -> list[KnowledgeHit]:
    scored = [
        (_cosine(query_vector, doc.vector), doc)
        for doc in _candidates(category)
        if doc.vector
    ]
    scored.sort(key=lambda item: item[0], reverse=True)
    return [
        KnowledgeHit(doc=KnowledgeDoc.model_validate(doc.model_dump(exclude={"vector"})),
                     score=round(score, 4),
                     matchType="vector")
        for score, doc in scored[:limit]
    ]


# --- 병합 -----------------------------------------------------------------


def merge(
    vector_hits: list[KnowledgeHit],
    keyword_hits: list[KnowledgeHit],
    limit: int,
) -> list[KnowledgeHit]:
    """두 검색기의 결과를 합집합으로 합친다.

    순위를 합산하지 않는 이유: RRF 방식은 한쪽이 확신을 갖고 맞힌 문서를
    다른 쪽의 오답이 끌어내려 recall 이 오히려 떨어졌고(측정 22 -> 21),
    순위만 남기므로 신뢰도 판별 근거도 사라진다.
    여기서는 '한쪽에서라도 상위면 위로' 규칙(최선 순위)만 쓴다.
    """
    settings = get_settings()
    merged: dict[str, dict] = {}

    for rank, hit in enumerate(vector_hits):
        merged[hit.doc.id] = {
            "doc": hit.doc, "best_rank": rank, "vector": hit.score, "keyword": None
        }
    for rank, hit in enumerate(keyword_hits):
        entry = merged.get(hit.doc.id)
        if entry is None:
            merged[hit.doc.id] = {
                "doc": hit.doc, "best_rank": rank, "vector": None, "keyword": hit.score
            }
        else:
            entry["keyword"] = hit.score
            entry["best_rank"] = min(entry["best_rank"], rank)

    ordered = sorted(
        merged.values(),
        # 동순위는 벡터 점수로 가름. 벡터가 없는 문서는 뒤로.
        key=lambda e: (e["best_rank"], -(e["vector"] if e["vector"] is not None else -1)),
    )

    hits: list[KnowledgeHit] = []
    for entry in ordered[:limit]:
        vector_score, keyword_score = entry["vector"], entry["keyword"]
        if vector_score is not None and keyword_score is not None:
            match_type = "both"
        elif vector_score is not None:
            match_type = "vector"
        else:
            match_type = "keyword"

        confident = (
            (vector_score is not None and vector_score >= settings.knowledge_min_vector_score)
            or (keyword_score is not None and keyword_score >= settings.knowledge_min_keyword_score)
        )
        hits.append(
            KnowledgeHit(
                doc=entry["doc"],
                # 대표 점수는 스케일이 0~1로 일정한 벡터 쪽을 우선한다.
                score=vector_score if vector_score is not None else keyword_score,
                matchType=match_type,
                confidence="high" if confident else "low",
                vectorScore=vector_score,
                keywordScore=keyword_score,
            )
        )
    return hits


# --- entrypoint -----------------------------------------------------------


async def search(
    query: str,
    category: KnowledgeCategory | None = None,
    limit: int | None = None,
) -> list[KnowledgeHit]:
    """벡터·키워드를 모두 돌려 합집합을 돌려준다.

    두 검색기의 실패가 서로 겹치지 않아(측정) 합집합이면 정답을 놓치지 않는다.
    어느 쪽도 확신하지 못한 문서는 버리지 않고 confidence="low" 로 표시해
    모델이 "확인 필요"로 답할 수 있게 한다.
    AWS 키나 벡터가 없으면 키워드 결과만으로 같은 경로를 탄다.
    """
    settings = get_settings()
    limit = max(1, min(limit or settings.knowledge_top_k, 5))
    query = (query or "").strip()
    if not query:
        return []

    # 병합 전에는 각 검색기에서 조금 넉넉히 받아야 합집합의 이점이 산다.
    depth = min(limit * 2, 10)
    keyword_hits = _keyword_search(query, category, depth)
    vector_hits: list[KnowledgeHit] = []

    if any(doc.vector for doc in _candidates(category)):
        try:
            # boto3 는 블로킹이라 이벤트 루프를 막지 않도록 스레드로 넘긴다.
            vectors = await asyncio.to_thread(embed_texts, [query])
            vector_hits = _vector_search(vectors[0], category, depth)
        except Exception as exc:
            logger.warning("vector search failed, using keyword only: %s", exc)

    return merge(vector_hits, keyword_hits, limit)
