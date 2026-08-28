# 지식 코퍼스 (`backend/data/knowledge/`)

AI 코치의 `search_knowledge` 도구가 검색하는 원문이다. JSONL 이며 **1줄 = 1문서 = 1청크**.

## 스키마

| 필드 | 필수 | 설명 |
|---|---|---|
| `id` | ✅ | 전역 고유. `{category}-{slug}` 규칙 권장 |
| `category` | ✅ | `glossary` \| `policy` \| `product_terms` |
| `title` | ✅ | 검색 가중치가 본문의 3배. 질문에 쓰일 표현을 넣을 것 |
| `text` | ✅ | 본문. **1,500자 이하**. 넘으면 문서를 나눌 것 |
| `source` | | 근거 출처. 코치가 답변에 인용한다 |
| `updatedAt` | | `YYYY-MM-DD` |
| `tags` | | 검색 가중치가 `title` 과 동일 |

`#` 로 시작하는 줄과 빈 줄은 건너뛴다. 스키마에 맞지 않는 줄은 경고 로그만 남기고 건너뛴다.

## 파일

- `glossary.jsonl` — 금융 용어·개념. 직접 편집
- `policy.jsonl` — 청년 정책금융 (YP2026-49). 공고 원문 기반 8건 수록
- `product_terms.jsonl` — **생성물, 직접 편집 금지.** 인제스트가 금감원 공시에서 상품별 우대조건 원문 전체를 뽑아 매번 덮어쓴다

## 인덱스 빌드

```bash
cd backend
python -m scripts.build_knowledge_index              # 상품 갱신 + 임베딩
python -m scripts.build_knowledge_index --skip-products   # 기존 상품 문서 유지
python -m scripts.build_knowledge_index --no-embed        # 키워드 검색만
```

AWS 키가 없으면 자동으로 `--no-embed` 와 동일하게 동작한다. 인덱스 파일이 없어도
서비스는 이 디렉터리의 원문을 직접 읽어 키워드 검색으로 응답한다.
