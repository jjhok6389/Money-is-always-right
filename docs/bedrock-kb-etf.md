# Bedrock Knowledge Base (ETF)

코치의 `search_etf_knowledge` 도구가 이 KB를 조회합니다. **종가·변동성 숫자는 KB에 의존하지 않고** Firestore/`etfMetrics` 툴이 담당합니다.

## 1. 소스 파일

레포 `kb/etf/`

| 파일 | 용도 | 권장 메타데이터 |
|------|------|-----------------|
| `00_policy.md` | 성향 매핑, 안정형 ETF 없음, 면책 | `docType=policy` |
| `01_glossary.md` | ETF, NAV, 레버리지, 변동성 | `docType=glossary` |
| `10_{종목코드}.md` | 종목 소개 + 동기화 시점 스냅샷 | `docType=product`, `symbol=` |

`POST /api/etf/sync` 또는 `python -m app.jobs.sync_etf` 가 위 마크다운을 덮어씁니다.

## 2. 콘솔에서 할 일

1. S3 버킷을 만들고 `kb/etf/` 내용을 업로드합니다. 예: `s3://your-bucket/kb/etf/`
2. Amazon Bedrock → Knowledge bases → Create
   - Embedding: `amazon.titan-embed-text-v2:0` (또는 콘솔 기본값)
   - Data source: 위 S3 prefix
3. 생성된 **Knowledge Base ID** 를 서버 `BEDROCK_KNOWLEDGE_BASE_ID` 에만 넣고, 저장소에 커밋하지 않습니다.
4. 데이터 소스를 Sync 합니다. ETF 배치 이후 S3를 다시 올린 뒤에도 Sync가 필요합니다.
5. Retrieve 테스트 후 백엔드를 재시작합니다.

ID가 비어 있거나 Retrieve가 실패하면 앱은 죽지 않고 `etfPolicy` + 로컬 용어로 답합니다.

## 3. 운영 순서

1. `POST /api/etf/sync` (KRX 또는 mock 원장 갱신 + `kb/etf` 재생성)
2. `kb/etf` → S3 업로드
3. Bedrock KB Sync
4. 대시보드/코치는 `etfMetrics` 만 읽어 빠르게 응답합니다.
