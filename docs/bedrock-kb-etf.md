# Bedrock Knowledge Base (ETF)

코치의 `search_etf_knowledge` 도구가 이 KB를 조회합니다. **종가·변동성 숫자는 KB에 의존하지 않고** Firestore/`etfMetrics` 툴이 담당합니다.

## 1. 소스 파일

레포 `kb/etf/`

| 파일 | 용도 | 권장 메타데이터 |
|------|------|-----------------|
| `00_policy.md` | 성향 매핑, 안정형 ETF 없음, 면책 | `docType=policy` |
| `01_glossary.md` | ETF, NAV, 레버리지, 변동성 | `docType=glossary` |
| `10_{종목코드}.md` | 종목 소개 + 동기화 시점 스냅샷 | `docType=product`, `symbol=` |

`POST /api/etf/sync` 또는 `python -m app.jobs.sync_etf` 가 위 마크다운을 덮어쓴 뒤, 설정이 있으면 **S3 업로드 + Bedrock Ingestion**까지 이어서 실행합니다.

## 2. 콘솔 / env

1. S3 버킷 + prefix (예: `s3://money-etf-s3/kb/etf/`)
2. Bedrock Knowledge Base + Data source
3. `.env` 예:
   - `BEDROCK_KNOWLEDGE_BASE_ID`
   - `BEDROCK_KB_DATA_SOURCE_ID` (콘솔 Data source ID)
   - `ETF_S3_BUCKET` / `ETF_S3_PREFIX`
   - `ETF_SYNC_SCHEDULER_ENABLED=true`
   - `ETF_SYNC_HOUR_KST=18` (평일, Asia/Seoul)

앱은 Managed KB면 `managedSearchConfiguration`, 기존(custom) KB면 `vectorSearchConfiguration`을 자동으로 고릅니다.
ID가 비어 있거나 Retrieve가 실패하면 앱은 죽지 않고 `etfPolicy` + 로컬 용어로 답합니다.

## 3. 일일 운영

백엔드가 떠 있으면 **평일 18:00 KST**에 스케줄러가 자동 실행합니다.

1. KRX → Firestore 원장 + `kb/etf` 재생성  
2. S3 업로드 (`ETF_S3_BUCKET` 있을 때)  
3. Bedrock `StartIngestionJob` (`BEDROCK_KB_DATA_SOURCE_ID` 있을 때)  
4. 대시보드/추천은 Firestore `etfMetrics`만 읽음  

수동: `python -m app.jobs.sync_etf` 또는 로그인 후 `POST /api/etf/sync`.
