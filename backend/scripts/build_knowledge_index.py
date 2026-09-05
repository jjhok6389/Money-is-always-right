"""
Build the coach's knowledge index (YP2026-59).

  cd backend
  python -m scripts.build_knowledge_index [--skip-products] [--no-embed]

1. 금감원 공시에서 상품별 우대조건 원문을 뽑아 data/knowledge/product_terms.jsonl 생성
2. data/knowledge/*.jsonl 전체를 읽어 임베딩
3. data/knowledge_index.json 으로 출력

원본 코퍼스(glossary/policy)는 읽기만 하며 절대 덮어쓰지 않는다.
AWS 키가 없으면 벡터 없이 문서만 기록하고, 서비스는 키워드 검색으로 동작한다.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

# Windows 기본 콘솔(cp949)에서 한글·기호 출력이 죽지 않도록 한다.
for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings  # noqa: E402
from app.models.knowledge import KnowledgeDoc  # noqa: E402
from app.services import fss_client, knowledge_service  # noqa: E402

PRODUCT_FILE = knowledge_service.CORPUS_DIR / "product_terms.jsonl"


def _clean(value: str | None) -> str:
    """FSS 공시의 회사명·상품명에는 개행과 연속공백이 섞여 있어 한 줄로 정규화한다."""
    return " ".join((value or "").split())


def _product_docs(response, product_type: str) -> list[KnowledgeDoc]:
    """상품 1건 = 문서 1건. agent_tools 가 120자로 자르는 우대조건 원문을 여기서는 전부 담는다."""
    docs: list[KnowledgeDoc] = []
    for product in response.products:
        company = _clean(product.companyName)
        name = _clean(product.productName)
        sections = [
            f"가입방법: {product.joinWay}" if product.joinWay else "",
            f"가입대상: {product.joinMember}" if product.joinMember else "",
            f"우대조건: {product.spclCnd}" if product.spclCnd else "",
            f"기타 유의사항: {product.etcNote}" if product.etcNote else "",
            f"최고한도: {product.maxLimit:,}원" if product.maxLimit else "",
        ]
        body = "\n".join(section for section in sections if section)
        if not body:
            continue

        term = f"{product.bestTermMonths}개월" if product.bestTermMonths else "기간 미표기"
        rate = f"최고금리 {product.bestRate}%" if product.bestRate is not None else "금리 미표기"
        text = f"{company} {name} ({term} 기준 {rate})\n{body}"

        docs.append(
            KnowledgeDoc(
                id=f"product-{product_type}-{product.companyCode}-{product.productCode}",
                category="product_terms",
                title=f"{company} {name} 가입조건",
                text=text[: knowledge_service.MAX_DOC_CHARS],
                source=(
                    "금융감독원 금융상품한눈에 공시"
                    if response.source == "fss"
                    else "모의 상품 데이터 (FSS_API_KEY 미설정)"
                ),
                updatedAt=product.disclosureMonth,
                tags=[
                    company,
                    name,
                    "예금" if product_type == "deposit" else "적금",
                    "우대조건",
                    "가입조건",
                ],
            )
        )
    return docs


async def _refresh_product_docs() -> int:
    docs: list[KnowledgeDoc] = []
    for product_type in ("deposit", "saving"):
        response = await fss_client.fetch_products(product_type)
        if response.source == "mock":
            print(f"  ! {product_type}: 금감원 응답 없음 → 모의 데이터로 생성 ({response.message})")
        docs.extend(_product_docs(response, product_type))

    PRODUCT_FILE.write_text(
        "".join(doc.model_dump_json(exclude_none=True) + "\n" for doc in docs),
        encoding="utf-8",
    )
    return len(docs)


def _collect_docs() -> list[KnowledgeDoc]:
    docs: list[KnowledgeDoc] = []
    seen: set[str] = set()
    for path in sorted(knowledge_service.CORPUS_DIR.glob("*.jsonl")):
        loaded = knowledge_service.read_corpus_file(path)
        print(f"  - {path.name}: {len(loaded)}건")
        for doc in loaded:
            if doc.id in seen:
                print(f"    ! 중복 id 건너뜀: {doc.id}")
                continue
            seen.add(doc.id)
            docs.append(doc)
    return docs


def main() -> int:
    parser = argparse.ArgumentParser(description="지식 인덱스 빌드")
    parser.add_argument(
        "--skip-products",
        action="store_true",
        help="금감원 상품 문서를 다시 만들지 않고 기존 product_terms.jsonl 을 그대로 사용",
    )
    parser.add_argument(
        "--no-embed",
        action="store_true",
        help="임베딩 없이 문서만 기록 (키워드 검색 전용 인덱스)",
    )
    args = parser.parse_args()

    settings = get_settings()
    knowledge_service.CORPUS_DIR.mkdir(parents=True, exist_ok=True)

    if args.skip_products:
        print("상품 문서 갱신 건너뜀 (--skip-products)")
    else:
        print("금감원 상품 공시 수집 중...")
        count = asyncio.run(_refresh_product_docs())
        print(f"  -> {PRODUCT_FILE.name}: {count}건")

    print("코퍼스 로드 중...")
    docs = _collect_docs()
    if not docs:
        print("문서가 없습니다. data/knowledge/*.jsonl 을 먼저 채우세요.")
        return 1

    has_credentials = bool(settings.aws_access_key_id and settings.aws_secret_access_key)
    embed = not args.no_embed
    if embed and not has_credentials:
        print("AWS 키가 없어 임베딩을 건너뜁니다. 키워드 검색 전용 인덱스로 빌드합니다.")
        embed = False

    vectors: list[list[float] | None] = [None] * len(docs)
    if embed:
        print(f"임베딩 생성 중 ({settings.bedrock_embedding_model_id}, {len(docs)}건)...")
        try:
            vectors = list(
                knowledge_service.embed_texts([f"{doc.title}\n{doc.text}" for doc in docs])
            )
        except Exception as exc:
            print(f"임베딩 실패 → 키워드 전용 인덱스로 진행합니다. ({exc})")
            vectors = [None] * len(docs)

    out_path = knowledge_service.index_path()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(
            {
                "embeddingModelId": settings.bedrock_embedding_model_id if embed else None,
                "dimensions": settings.bedrock_embedding_dimensions if embed else None,
                "count": len(docs),
                "docs": [
                    {**doc.model_dump(), "vector": vector}
                    for doc, vector in zip(docs, vectors)
                ],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    embedded = sum(1 for vector in vectors if vector)
    print(f"완료: {out_path} (문서 {len(docs)}건, 벡터 {embedded}건)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
