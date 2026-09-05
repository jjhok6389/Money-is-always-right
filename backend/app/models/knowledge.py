"""
Knowledge base models for the coach's retrieval tool (기능 명세 5.3 / YP2026-59).

A document is the smallest retrievable unit. Corpus files under
``backend/data/knowledge/*.jsonl`` hold one document per line; the built index
adds an embedding vector to each of them.
"""

from typing import Literal, Optional

from pydantic import BaseModel, Field

KnowledgeCategory = Literal["glossary", "policy", "product_terms"]

CATEGORY_LABELS: dict[str, str] = {
    "glossary": "금융용어",
    "policy": "청년 정책금융",
    "product_terms": "상품 공시조건",
}


class KnowledgeDoc(BaseModel):
    id: str
    category: KnowledgeCategory
    title: str
    text: str
    # 인용 시 근거로 제시할 출처. 정책 문서는 공고명, 상품은 금감원 공시.
    source: Optional[str] = None
    updatedAt: Optional[str] = None
    tags: list[str] = Field(default_factory=list)


class IndexedDoc(KnowledgeDoc):
    # 임베딩 없이 빌드하면 None. 이 경우 키워드 검색만 동작한다.
    vector: Optional[list[float]] = None


class KnowledgeHit(BaseModel):
    doc: KnowledgeDoc
    # 대표 점수. 두 검색기가 모두 찾았으면 벡터 점수를 쓴다(스케일이 0~1로 일정).
    score: float
    matchType: Literal["vector", "keyword", "both"]
    # 임계값 이상이면 high. 차단 기준이 아니라 라벨이며, low 문서도 그대로 반환한다.
    confidence: Literal["high", "low"] = "high"
    # 진단·임계값 재측정용. 해당 검색기가 못 찾았으면 None.
    vectorScore: Optional[float] = None
    keywordScore: Optional[float] = None
