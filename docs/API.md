# Money is Always Right — API 명세서

| 항목 | 내용 |
|------|------|
| Base URL (로컬) | `http://localhost:8000` |
| 버전 | `0.5.0` |
| 문서(Swagger) | http://localhost:8000/docs |
| 인증 | Firebase ID Token (`Authorization: Bearer <token>`) |
| 응답 형식 | `application/json` |
| UI/에러 메시지 언어 | 한국어 |

관련 Jira: `YP2026-64` API 명세서 작성

---

## 1. 공통 사항

### 1.1 인증

대부분의 `/api/*` 엔드포인트는 Firebase Auth로 발급받은 **ID Token**이 필요합니다.

```http
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
```

| 모드 | 조건 | 동작 |
|------|------|------|
| 운영(권장) | `backend/serviceAccountKey.json` 등 Admin 자격 증명 설정 | 토큰 서명 검증 |
| 데모 | `ALLOW_DEMO_MODE=true` 이고 자격 증명 없음 | 토큰 payload에서 `uid` 추출(완화 검증) |

인증 실패 시:

```json
{
  "detail": "인증 토큰이 필요합니다."
}
```

또는

```json
{
  "detail": "유효하지 않은 인증 토큰입니다."
}
```

HTTP `401 Unauthorized`

### 1.2 공통 에러 형식

```json
{
  "detail": "한국어 에러 메시지"
}
```

검증 실패 시 FastAPI 기본 형식:

```json
{
  "detail": [
    {
      "loc": ["body", "fieldName"],
      "msg": "...",
      "type": "..."
    }
  ]
}
```

### 1.3 열거형 참고

| 이름 | 값 |
|------|-----|
| `investmentPropensity` | `stable` (안정형), `stable_seeking` (안정추구형), `neutral` (위험중립형), `aggressive` (적극투자형), `very_aggressive` (공격투자형) |
| `expenseType` | `fixed` (고정비), `variable` (변동비) |
| `productType` | `deposit` (예금), `saving` (적금), `annuity` (연금저축) |
| `category` | `food`, `transport`, `housing`, `telecom`, `shopping`, `leisure`, `medical`, `education`, `savings`, `income`, `other` |

---

## 2. Health

### `GET /health`

서버 상태 확인. **인증 불필요.**

**Response `200`**

```json
{
  "status": "ok",
  "phase": 5,
  "demoMode": true
}
```

| 필드 | 설명 |
|------|------|
| `phase` | 구현 단계 표시 (현재 5) |
| `demoMode` | Firebase Admin 데모 모드 여부 |

---

## 3. Users — 사용자 프로필

Prefix: `/api/users`

### `GET /api/users/me`

저장된 내 프로필 조회.

**Response `200`**

```json
{
  "uid": "firebaseUid",
  "email": "user@example.com",
  "displayName": "홍길동",
  "age": 28,
  "occupation": "직장인",
  "monthlyIncome": 3200000,
  "fixedExpenses": 1500000,
  "estimatedMonthlySavings": 700000,
  "investmentPropensity": "neutral",
  "targetAssetAmount": 50000000,
  "targetYears": 5,
  "goalDescription": "내 집 마련 계약금",
  "onboardingCompleted": true,
  "createdAt": "2026-08-22T00:00:00.000Z"
}
```

**Response `404`** — 프로필 없음

```json
{ "detail": "사용자 프로필을 찾을 수 없습니다." }
```

---

### `PUT /api/users/me`

온보딩/프로필 업서트 (merge).

**Request body**

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `displayName` | string | ✅ | 이름 |
| `age` | int | ✅ | 18~100 |
| `occupation` | string | ✅ | 직업/신분 |
| `monthlyIncome` | int | ✅ | 월 소득(원) ≥ 0 |
| `fixedExpenses` | int | ✅ | 월 고정 지출(원) ≥ 0 |
| `estimatedMonthlySavings` | int | ✅ | 예상 월 저축 ≥ 0 |
| `investmentPropensity` | string | ✅ | `stable` \| `stable_seeking` \| `neutral` \| `aggressive` \| `very_aggressive` |
| `targetAssetAmount` | int | ✅ | 목표 자산(원) ≥ 0 |
| `targetYears` | int | ✅ | 1~40 |
| `goalDescription` | string | ✅ | 목표 설명 |
| `onboardingCompleted` | bool | | 기본 `true` |
| `email` | string | | 없으면 토큰 email 사용 |
| `createdAt` | string | | ISO 문자열 |

**Response `200`** — `UserProfileResponse` (위와 동일 + `uid`)

> 프론트는 Firestore에도 직접 저장하며, 이 API로 백엔드 동기화를 시도합니다.

---

## 4. Transactions — 소비 거래 파이프라인

Prefix: `/api/transactions`

더미(Mock) 거래 데이터를 생성하고 카테고리·고정/변동비로 분류합니다.

### `GET /api/transactions/pipeline`

**Query**

| 이름 | 타입 | 기본 | 설명 |
|------|------|------|------|
| `month` | string | 현재월 | `YYYY-MM` |
| `count` | int | 40 | 10~120 |

**Response `200`**

```json
{
  "userId": "firebaseUid",
  "generatedAt": "2026-08-22T05:00:00Z",
  "month": "2026-08",
  "transactions": [
    {
      "id": "uid-2026-08-01-1",
      "date": "2026-08-01",
      "description": "스타벅스 강남점",
      "merchant": "스타벅스 강남점",
      "amount": 5500,
      "category": "food",
      "categoryLabel": "식비",
      "expenseType": "variable",
      "expenseTypeLabel": "변동비",
      "isIncome": false
    }
  ],
  "categorySummaries": [
    {
      "category": "food",
      "categoryLabel": "식비",
      "totalAmount": 320000,
      "count": 12,
      "expenseType": "variable"
    }
  ],
  "totals": {
    "income": 3200000,
    "fixedExpenses": 800000,
    "variableExpenses": 600000,
    "totalExpenses": 1400000,
    "netCashflow": 1800000
  }
}
```

---

### `POST /api/transactions/pipeline`

시드 지정 재생성.

**Request body**

```json
{
  "month": "2026-08",
  "count": 45,
  "seed": 12345
}
```

**Response `200`** — `GET`과 동일 (`TransactionPipelineResult`)

---

### `POST /api/transactions/classify`

단일 문구 분류 유틸.

**Query**

| 이름 | 필수 | 설명 |
|------|------|------|
| `description` | ✅ | 거래 설명 |
| `merchant` | | 가맹점명 |

**Response `200`**

```json
{
  "category": "food",
  "categoryLabel": "식비",
  "expenseType": "variable",
  "expenseTypeLabel": "변동비"
}
```

---

## 5. Products — 예·적금 상품

Prefix: `/api/products`

금융감독원 금융상품한눈에 Open API.  
`FSS_API_KEY` 없으면 모의 데이터 (`source: "mock"`).

### `GET /api/products`

**Query**

| 이름 | 타입 | 기본 | 설명 |
|------|------|------|------|
| `productType` | string | `saving` | `deposit` \| `saving` \| `annuity` |
| `topFinGrpNo` | string | env 기본 `020000` | 금융권역 (은행 `020000`, 저축은행 `030300`) |
| `pageNo` | int | 1 | 1~50 |

**Response `200`**

```json
{
  "source": "fss",
  "productType": "saving",
  "topFinGrpNo": "020000",
  "count": 59,
  "products": [
    {
      "productType": "saving",
      "companyName": "국민은행",
      "productName": "KB 청년 적금",
      "productCode": "...",
      "companyCode": "...",
      "joinWay": "스마트폰",
      "joinMember": "제한없음",
      "spclCnd": "...",
      "etcNote": "...",
      "maxLimit": null,
      "disclosureMonth": "202608",
      "options": [
        {
          "saveTermMonths": 12,
          "interestRate": 3.5,
          "maxInterestRate": 4.2,
          "interestType": "단리",
          "reserveType": "정액적립식"
        }
      ],
      "bestRate": 4.2,
      "bestTermMonths": 12
    }
  ],
  "message": null
}
```

| `source` | 의미 |
|----------|------|
| `fss` | 금감원 실데이터 |
| `mock` | 키 없음/호출 실패 → 모의 상품 |

### 별칭 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/products/deposits` | 정기예금만 |
| GET | `/api/products/savings` | 적금만 |
| GET | `/api/products/annuities` | 연금저축만 |

Query: `topFinGrpNo`, `pageNo` (동일)

---

## 6. Dashboard — 맞춤 대시보드

Prefix: `/api/dashboard`

포트폴리오, 소비, 목표 갭/달성률, 로드맵, 추천 상품, 부채 우선순위를 한 번에 반환합니다.

### `GET /api/dashboard`

서버에 저장된 프로필 기준 계산.

**Response `404`** — 온보딩 프로필 없음

---

### `POST /api/dashboard/compute` ✅ 프론트 권장

클라이언트 프로필 스냅샷으로 계산 (Firestore 동기화 지연 대비).

**Request body**

```json
{
  "profile": {
    "displayName": "홍길동",
    "monthlyIncome": 3200000,
    "fixedExpenses": 1500000,
    "estimatedMonthlySavings": 700000,
    "investmentPropensity": "neutral",
    "targetAssetAmount": 50000000,
    "targetYears": 5,
    "goalDescription": "내 집 마련",
    "age": 28,
    "occupation": "직장인"
  },
  "currentAssets": 5000000,
  "debtBalance": 0,
  "month": "2026-08"
}
```

| 필드 | 설명 |
|------|------|
| `profile` | 없으면 서버 저장 프로필 사용 |
| `currentAssets` | 현재 자산(원). 없으면 저축여력×6개월 추정 |
| `debtBalance` | 부채 잔액(원) |
| `month` | 소비 파이프라인 기준월 `YYYY-MM` |

**Response `200`**

```json
{
  "generatedAt": "2026-08-22T05:00:00Z",
  "month": "2026-08",
  "portfolio": [
    { "key": "cash", "label": "현금·입출금", "amount": 1000000, "ratio": 0.2 }
  ],
  "consumption": [
    {
      "category": "food",
      "categoryLabel": "식비",
      "amount": 320000,
      "expenseType": "variable"
    }
  ],
  "consumptionTotals": {
    "income": 3200000,
    "fixedExpenses": 800000,
    "variableExpenses": 600000,
    "totalExpenses": 1400000,
    "netCashflow": 1800000
  },
  "goal": {
    "currentAssets": 4200000,
    "targetAssetAmount": 50000000,
    "gapAmount": 45800000,
    "achievementRate": 8.4,
    "monthlySavingsCapacity": 700000,
    "estimatedMonthsToGoal": 66,
    "estimatedAchievementDate": "2032-02-22",
    "onTrack": true,
    "targetYears": 5,
    "goalDescription": "내 집 마련"
  },
  "roadmap": [
    {
      "priority": 1,
      "title": "월 저축 여력 확보",
      "detail": "...",
      "category": "savings"
    }
  ],
  "recommendedProducts": [
    {
      "productType": "saving",
      "companyName": "국민은행",
      "productName": "KB 청년 적금",
      "bestRate": 4.2,
      "bestTermMonths": 12,
      "reason": "수익과 안정의 균형을 위해 중기 적립을 권장합니다."
    }
  ],
  "debtRepaymentPriority": [
    {
      "priority": 1,
      "title": "현재 확인된 부채 없음",
      "detail": "...",
      "category": "debt"
    }
  ]
}
```

---

## 7. Simulation — 디지털 트윈

Prefix: `/api/simulation`

월 적립액 = `(소득 − 지출) × 저축률(%)`  
월복리로 자산 궤적을 투사하고, 기본 로드맵 vs 시나리오를 비교합니다.

### `POST /api/simulation/run`

baseline / scenario를 직접 전달.

**Request body**

```json
{
  "label": "맞춤 시나리오",
  "baseline": {
    "monthlyIncome": 3200000,
    "monthlyExpenses": 1500000,
    "savingsRate": 80,
    "annualInterestRate": 3.5,
    "currentAssets": 4200000,
    "horizonMonths": 60,
    "targetAssetAmount": 50000000
  },
  "scenario": {
    "monthlyIncome": 3500000,
    "monthlyExpenses": 1400000,
    "savingsRate": 90,
    "annualInterestRate": 4.5,
    "currentAssets": 4200000,
    "horizonMonths": 60,
    "targetAssetAmount": 50000000
  }
}
```

**Response `200`**

```json
{
  "generatedAt": "2026-08-22T05:00:00Z",
  "trajectory": [
    {
      "monthIndex": 0,
      "label": "2026-08",
      "baselineAssets": 4200000,
      "scenarioAssets": 4200000,
      "targetAssetAmount": 50000000
    }
  ],
  "baselineSummary": {
    "monthlyDeposit": 1360000,
    "finalAssets": 90000000,
    "targetHitMonth": 36,
    "targetHitLabel": "2029-08",
    "surplusVsBaseline": 0
  },
  "scenarioSummary": {
    "monthlyDeposit": 1890000,
    "finalAssets": 120000000,
    "targetHitMonth": 24,
    "targetHitLabel": "2028-08",
    "surplusVsBaseline": 30000000
  },
  "insights": [
    "시나리오의 월 적립액이 기본 로드맵보다 530,000원 많습니다.",
    "목표 달성 시점이 약 12개월 앞당겨질 수 있습니다."
  ]
}
```

---

### `POST /api/simulation/from-profile` ✅ 프론트 권장

프로필로 baseline을 만들고 `scenario` 필드만 덮어씁니다.

**Request body**

```json
{
  "profile": {
    "monthlyIncome": 3200000,
    "fixedExpenses": 1500000,
    "estimatedMonthlySavings": 700000,
    "targetAssetAmount": 50000000,
    "targetYears": 5
  },
  "scenario": {
    "monthlyIncome": 3500000,
    "monthlyExpenses": 1400000,
    "savingsRate": 90,
    "annualInterestRate": 5.0,
    "horizonMonths": 60
  },
  "currentAssets": 5000000,
  "label": "맞춤 시나리오"
}
```

**Response `200`** — `SimulationResponse`  
**Response `404`** — 프로필 없음

---

## 8. Coach — AI 금융 코치

Prefix: `/api/coach`

AWS Bedrock Converse 호출. 실패/키 없음 시 로컬 한국어 fallback.

### `POST /api/coach/chat`

**Request body**

```json
{
  "message": "적금 추천해줘",
  "history": [
    { "role": "user", "content": "안녕" },
    { "role": "assistant", "content": "안녕하세요! ..." }
  ],
  "profile": {
    "displayName": "홍길동",
    "monthlyIncome": 3200000,
    "fixedExpenses": 1500000,
    "estimatedMonthlySavings": 700000,
    "investmentPropensity": "stable",
    "targetAssetAmount": 50000000,
    "targetYears": 5,
    "goalDescription": "내 집 마련"
  },
  "dashboardHints": {}
}
```

| 필드 | 제약 |
|------|------|
| `message` | 1~2000자 |
| `history` | 최대 20개, `role`: `user` \| `assistant` |

**Response `200`**

```json
{
  "reply": "안정형 성향 기준으로는 ...",
  "source": "fallback",
  "modelId": null,
  "suggestions": [
    "내 목표 달성까지 얼마나 걸릴까?",
    "안정형에게 맞는 적금 추천해줘",
    "변동비를 줄이려면 어디부터 줄일까?",
    "예금이랑 적금 중 뭐가 나을까?"
  ]
}
```

| `source` | 의미 |
|----------|------|
| `bedrock` | AWS Bedrock 응답 |
| `fallback` | 로컬 안내 모드 |

**Response `502`** — Bedrock 실패 + fallback 비활성

---

### `GET /api/coach/suggestions`

추천 질문 목록.

**Response `200`**

```json
{
  "suggestions": [
    "내 목표 달성까지 얼마나 걸릴까?",
    "안정형에게 맞는 적금 추천해줘",
    "변동비를 줄이려면 어디부터 줄일까?",
    "예금이랑 적금 중 뭐가 나을까?"
  ]
}
```

---

## 9. 프론트엔드 호출 위치

| 도메인 | Frontend service |
|--------|------------------|
| 공통 fetch | `frontend/src/services/api.js` |
| 프로필 | `userService.js` |
| 거래 | `transactionService.js` |
| 상품 | `productService.js` |
| 대시보드 | `dashboardService.js` |
| 시뮬레이션 | `simulationService.js` |
| 코치 | `coachService.js` |

---

## 10. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-08-22 | Phase 1~5 기준 초안 작성 (`YP2026-64`) |

실시간 스키마 확인은 실행 중 서버의 **Swagger** (`/docs`)를 우선합니다.

### 스프레드시트 버전 (팀 공유용)

| 파일 | 내용 |
|------|------|
| [`API_endpoints.csv`](./API_endpoints.csv) | 엔드포인트 목록 |
| [`API_schemas.csv`](./API_schemas.csv) | 주요 필드/스키마 |
| [`API_overview.csv`](./API_overview.csv) | 공통 규칙 요약 |

Google Sheets: **파일 → 가져오기 → 업로드** 후 CSV 선택  
Excel: CSV를 더블클릭하거나 데이터 → 텍스트/CSV에서 가져오기 (UTF-8)
