# 지식 검색 평가 세트 (`backend/data/eval/`)

`search_knowledge` 의 검색 품질을 숫자로 재기 위한 세트. 검색 로직을 바꿀 때
**바꾸기 전에 기준선을 저장하고, 바꾼 뒤 비교**하는 것이 이 세트의 용도다.

```bash
cd backend
python -m scripts.eval_knowledge                          # union = 서비스와 동일한 합집합 (기본)
python -m scripts.eval_knowledge --mode both              # 벡터/키워드 개별 비교
python -m scripts.eval_knowledge --mode keyword           # AWS 키 없이
python -m scripts.eval_knowledge --save runs/union.json
python -m scripts.eval_knowledge --baseline runs/union.json
python -m scripts.eval_knowledge --routing                # 검색기가 아니라 도구 선택을 평가
```

## 케이스 스키마 — `knowledge_eval.jsonl`

| 필드 | 필수 | 설명 |
|---|---|---|
| `id` | ✅ | `eval-NNN` |
| `query` | ✅ | 사용자가 실제로 칠 법한 문장 그대로 |
| `category` | | `search_knowledge` 가 넘기는 카테고리. `null` 이면 전체 검색(더 어려운 조건) |
| `expected` | ✅ | 정답 문서. 빈 배열이면 "low 로 표시하는 게 정답" |
| `group` | ✅ | 아래 그룹 중 하나 |
| `reason` | | `corpus-gap` \| `other-tool` — 정답이 없는 이유 |
| `expectedTools` | | `--routing` 전용. 이 질문이 가야 할 도구 |
| `note` | | 사람이 읽을 메모 |

### `expected` 표기

- `"glossary-early-termination"` — 문서 id 정확일치
- `"title:우리SUPER주거래적금"` — title 부분문자열. **상품 문서는 반드시 이 형식**
  (상품 id `product-{type}-{companyCode}-{productCode}` 는 공시가 바뀌면 사라짐)
- 정답이 현재 코퍼스에 없으면 스크립트가 `STALE` 로 보고하고 **채점에서 제외**한다.
  상품 단종을 검색 실패로 오인하지 않기 위함

## 그룹

| group | 뜻 | 이 그룹이 나빠지면 |
|---|---|---|
| `glossary` | 용어 정의 | 기본 지식 답변 품질 저하 |
| `paraphrase` | 같은 의도 다른 표현 | 구어체·우회 표현에 취약해짐 |
| `product` | 상품명을 명시한 질문 | 상품 우대조건 답변 실패 |
| `policy` | 정책금융 | 청년 정책 질문 실패 |
| `gap` | 코퍼스에 문서가 없는 주제 | 엉뚱한 근사 문서를 근거로 답함 |
| `negative` | 다른 도구가 처리할 질문 | 지식검색이 불필요하게 끼어듦 |

`gap` 과 `negative` 는 `expected: []` 로 같지만 원인이 다르다.
`gap` 은 **문서를 채우면** 해결되고, `negative` 는 **라우팅**(모델 판단 또는
`coach_service.ROUTING_RULES`)에서 걸러야 한다.

## 지표

| 지표 | 뜻 | 목표 |
|---|---|---|
| **`recall@set`** | 모델에 실제로 넘어가는 상위 3건 안에 정답이 있는가 | **1.000** |
| **`high_label_rate`** | 정답을 넘겼을 때 `confidence=high` 로 표시한 비율 | 높을수록 좋음 |
| **`low_label_rate`** | 정답 없는 질문을 `low` 로 올바르게 표시한 비율 | 높을수록 좋음 |
| `recall@k` | 정답이 상위 k 안에 들어온 비율 (순위 품질 참고) | |
| `mrr` | 첫 정답 순위의 역수 평균 | |
| `false_positive_rate` | 문서를 반환했는지 여부 (합집합 도입 전 지표와 비교용) | |

`recall@set` 이 핵심이다. **1위일 필요는 없다** — 상위 3건 안에만 들어가면 모델이 골라 쓴다.

### confidence 는 보조 신호다

`low` 는 "이 문서가 질문과 안 맞을 수 있다"는 힌트이지 차단이 아니다. 문서는 그대로 넘어간다.

**점수만으로는 '코퍼스에 없는 주제'를 못 거른다**는 게 측정으로 확인됐다.
`eval-031` "청년내일저축계좌"(짧은 질의)는 벡터 0.3796 으로 정답 케이스 다수보다 높다 —
질의가 짧을수록 무관한 문서와도 점수가 높게 나오기 때문이다.
**최종 방어선은 모델이 문서 내용을 읽고 판단하는 것**이고(시스템 프롬프트 규칙 8·9),
임계값은 그 앞단의 보조 장치다. 코퍼스를 채우는 것이 근본 해결이다.

## 라우팅 평가 (`--routing`)

`negative` 그룹의 오검출은 검색 품질 문제가 아니라 **애초에 `search_knowledge` 를
부르지 말았어야 하는** 문제다. `expectedTools` 가 있는 케이스만 골라
`coach_service._route_tools()` 로 도구 선택을 검사한다.
폴백 경로의 규칙 기반 라우터만 측정 가능하며, Bedrock 경로는 모델이 정한다.

## 케이스 추가 규칙

- 문서를 새로 넣으면 **그 문서를 겨냥한 케이스도 같이 넣는다**
- `gap` 케이스의 문서를 채웠으면 `expected` 를 새 id 로 바꾸고 그룹을 옮긴다
- 정답은 **한 문서로 답이 되는 질문**만 고른다. 여러 문서를 합쳐야 답이 되는
  질문은 검색 평가가 아니라 생성 평가 영역이므로 넣지 않는다
- 쿼리 임베딩은 `.query_cache.json` 에 캐시된다. 케이스를 추가하면 그 건만 새로 호출된다
