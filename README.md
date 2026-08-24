# Money is Always Right

청년 맞춤형 **AI 자산 관리 · 금융상품 추천** 웹 플랫폼입니다.

소비 분석 · 예·적금 공시 · 목표 갭 분석 · 디지털 트윈 시뮬레이션 · AI 금융 코치를 제공합니다.  
사용자에게 보이는 UI·챗봇 문구는 모두 **한국어**입니다.

| 바로가기 | 링크 |
|----------|------|
| 프론트 (로컬) | http://127.0.0.1:5173 |
| 백엔드 Health | http://127.0.0.1:8000/health |
| Swagger | http://localhost:8000/docs |
| API 명세 (MD) | [docs/API.md](./docs/API.md) |
| API 명세 (시트) | [docs/API_endpoints.csv](./docs/API_endpoints.csv) |

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | React (Vite), React Router, Recharts |
| Backend | Python FastAPI, Uvicorn |
| Auth / DB | Firebase Auth, Cloud Firestore |
| 금융상품 | 금융감독원 금융상품한눈에 Open API |
| AI | AWS Bedrock (Claude) · 키 없으면 로컬 fallback |
| 지식 검색 | Bedrock Titan 임베딩 + 로컬 JSON 인덱스 · 키 없으면 키워드 검색 |

---

## 시스템 구조

```
React (:5173)  ──Firebase Auth / Firestore──┐
       │                                    │
       └── Bearer(ID Token) ──► FastAPI (:8000)
                                  ├ users / transactions / products
                                  ├ dashboard / simulation
                                  └ coach → Bedrock (or fallback)
                                         ├ products   → FSS (or mock)
                                         └ knowledge  → 로컬 인덱스 (벡터 or 키워드)
```

1. 가입·로그인 → Firebase Auth  
2. 온보딩 프로필 → Firestore `users/{uid}`  
3. 대시보드·시뮬레이션·코치 → FastAPI (+ 프로필 스냅샷)  
4. 상품·AI → API 키 있으면 실연동, 없으면 mock / fallback  

---

## 폴더 구조

```
.
├── frontend/          # React UI (pages, components, services, firebase)
├── backend/           # FastAPI (routes, services, models)
│   ├── data/knowledge/    # 코치 지식 코퍼스 (JSONL)
│   └── scripts/           # 지식 인덱스 빌드 CLI
├── docs/              # API 명세서 (MD + CSV)
├── firestore.rules
├── firebase.json
└── README.md
```

환경 변수는 **`frontend/.env` / `backend/.env`로 분리**합니다.  
(`VITE_*`는 브라우저 노출, AWS·FSS 키는 서버 전용)

---

## 화면

| 경로 | 설명 |
|------|------|
| `/login` `/signup` `/forgot-password` | 인증 |
| `/onboarding` | 소득·지출·투자성향·목표 설정 |
| `/` | 홈 · 프로필 요약 |
| `/dashboard` | 포트폴리오 · 소비 · 갭/달성률 · 로드맵 |
| `/transactions` | 더미 거래 분류 |
| `/products` | 예·적금 조회 |
| `/simulation` | 시나리오 vs 로드맵 궤적 비교 |
| 우하단 FAB | AI 금융 코치 |

---

## API 한눈에

| Method | Path | 설명 |
|--------|------|------|
| GET | `/health` | 헬스체크 |
| GET/PUT | `/api/users/me` | 프로필 |
| GET/POST | `/api/transactions/pipeline` | 더미 거래 파이프라인 |
| GET | `/api/products` | 예·적금 (`saving` \| `deposit`) |
| POST | `/api/dashboard/compute` | 맞춤 대시보드 (권장) |
| POST | `/api/simulation/from-profile` | 디지털 트윈 (권장) |
| POST | `/api/coach/chat` | AI 코치 |

인증: `Authorization: Bearer <Firebase ID Token>`  

상세 요청/응답 → [docs/API.md](./docs/API.md) · CSV → [docs/API_endpoints.csv](./docs/API_endpoints.csv)

### 키 유무에 따른 동작

| 기능 | 키 있음 | 키 없음 |
|------|---------|---------|
| Auth / 프로필 | Firebase | — (필수 설정) |
| 소비 거래 | — | 코드 더미 |
| 예·적금 | `source: fss` | `source: mock` |
| 대시보드·시뮬레이션 | 서버 계산 | 동일 |
| AI 코치 | `source: bedrock` | `source: fallback` |

`.env` 수정 후 **백엔드 재시작** 필요.

---

## 로컬 실행

**사전:** Firebase Email/Password Auth + Firestore 활성화, `frontend/.env`에 웹 설정값 입력.

```powershell
# Terminal 1 — Backend
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env          # 최초 1회
python -m scripts.build_knowledge_index   # 코치 지식 인덱스 (선택, 최초 1회)
uvicorn app.main:app --reload --port 8000
```

> `build_knowledge_index` 는 `backend/data/knowledge/*.jsonl` 을 읽어
> `backend/data/knowledge_index.json` 을 만든다. AWS 키가 있으면 Bedrock 임베딩으로
> 벡터 검색이, 없으면 키워드 검색이 쓰인다. **인덱스를 만들지 않아도 코치는 원문 코퍼스로
> 키워드 검색해 동작한다.** 코퍼스 스키마는 `backend/data/knowledge/README.md` 참고.

```powershell
# Terminal 2 — Frontend
cd frontend
copy .env.example .env          # 최초 1회 + Firebase 값
npm install
npm run dev
```

Firestore 규칙 배포:

```powershell
firebase deploy --only firestore:rules --project <PROJECT_ID>
```

### 환경 변수

- Frontend: `frontend/.env.example` 참고 (`VITE_FIREBASE_*`, `VITE_API_BASE_URL`)
- Backend: `backend/.env.example` 참고 (`FSS_API_KEY`, `AWS_*`, `ALLOW_DEMO_MODE` 등)
- **커밋 금지:** `.env`, `serviceAccountKey.json`

---

## Git · 협업

### 브랜치

```
main  →  develop  →  feature/<이슈-또는-기능>
```

1. `develop`에서 `feature/YP2026-42-login` 분기  
2. 작업 후 PR → `develop` 머지  
3. 배포 시 `develop` → `main`

### 커밋 메시지

```text
YP2026-XX 요약내용
```

예: `YP2026-42 회원가입 및 로그인 화면 구현`

- 작업(Task) 단위로 커밋 · 관련 파일만 포함  
- `.env` 등 시크릿 제외  
- 에픽은 브랜치/PR 설명용  

### Jira 매핑 (YP2026)

| 키 | 요약 |
|----|------|
| 42~44 | 로그인 · 온보딩 · 프로필 저장 |
| 45~46, 48 | 거래 파이프라인 · 금감원 예·적금 |
| 50~53 | 대시보드 · 갭 · 상품 큐레이션 |
| 55~57 | 시뮬레이션 |
| 58~60 | AI 코치 |
| 61~64 | 배포 · 명세서 · 발표자료 |

---

## 구현 현황

| 영역 | 상태 | Jira |
|------|------|------|
| 회원가입 · 로그인 · 비밀번호 찾기 | ✅ | YP2026-42 |
| 재무정보 · 투자성향 · 목표 온보딩 · Firestore 저장 | ✅ | YP2026-43, 44 |
| 마이데이터 Mock 거래 스키마 · 가상 거래 생성 · 분류 UI | ✅ | YP2026-45, 46 |
| 금감원 예·적금 Open API 연동 | ✅ | YP2026-48 |
| 포트폴리오 · 소비 · Gap · 로드맵 · 상품 큐레이션 | ✅ | YP2026-50~53 |
| 시나리오 엔진 · 변수 UI · 궤적 비교 차트 | ✅ | YP2026-55~57 |
| Bedrock 코치 · 상품 Q&A(부분) · 플로팅 챗봇 | ✅ | YP2026-58~60 |
| API 명세서 (MD / CSV) | ✅ | YP2026-64 |
| 페르소나 프리셋 · CSV 업로드 | ⏳ 미구현 | YP2026-47 |
| 청년 특화 정책금융 메타데이터 | ⏳ 미구현 | YP2026-49 |
| 재무 상태 스냅샷 DB | ⏳ 부분/미흡 | YP2026-54 |
| 클라우드 MVP 배포 | ⏳ 미구현 | YP2026-61 |
| 기능명세서 | ⏳ | YP2026-62 |
| 공모전 기획서 · 발표자료 | ⏳ | YP2026-63 |

---

## 앞으로 해야 할 일 · 디벨롭 로드맵

### 0. 당장 (레포 정리)

| 할 일 | 설명 |
|------|------|
| Jira 단위 커밋 | `YP2026-XX 요약` 형식으로 구현분 분할 커밋 |
| `develop` 통합 | feature 작업 → `develop` 머지 후 원격 푸시 |
| 브랜치 정리 | 커밋 없는 빈 `feature/phase*` 로컬 브랜치 삭제 |
| 시크릿 점검 | `.env` / 서비스계정 키가 git에 안 올라갔는지 확인 |

### 1. 단기 — 빠진 기능 메우기 (우선)

| 우선 | Jira | 할 일 | 디벨롭 포인트 |
|------|------|------|----------------|
| P0 | YP2026-47 | 페르소나 프리셋 로드 · CSV 업로드 | 프리셋 JSON + CSV 파서 → 거래 파이프라인 입력으로 연결 |
| P0 | YP2026-54 | 재무 상태 스냅샷 DB | Firestore `snapshots/{uid}` 또는 서브컬렉션에 시점별 자산·부채·가정 저장, 시뮬레이션 불러오기 |
| P1 | YP2026-49 | 청년 정책금융 메타데이터 | 코퍼스 틀은 `backend/data/knowledge/policy.jsonl` 에 있음(자리표시자 2건). **공고 원문으로 교체 필요** + 대시보드 추천에 반영 |
| P1 | YP2026-59 | 금융상품 Q&A 체인 강화 | ⏳ 기반 완료 — `search_knowledge` 도구 + 로컬 벡터 인덱스 구축됨. 남은 일: 코퍼스 확충 |
| P1 | — | Bedrock 실연동 안정화 | AWS 키·모델 권한, 타임아웃/재시도, 대화 이력 Firestore 저장 |

### 2. 중기 — 품질 · 제품화

| 할 일 | 설명 |
|------|------|
| 실거래 연동 준비 | 오픈뱅킹/마이데이터 실API 대비 어댑터 계층 (지금은 Mock 유지) |
| 추천 엔진 고도화 | 성향·목표기간·저축여력 스코어링으로 예·적금·정책상품 순위 |
| 알림·리마인더 | 목표 이탈, 고정비 초과, 저축 미달 시 홈/푸시 알림 |
| 모바일 UX | 반응형 점검, 챗봇·차트 터치 최적화 (PWA 선택) |
| 테스트 | API pytest, 프론트 핵심 플로우(가입→온보딩→대시보드) E2E |
| 관측성 | 백엔드 구조화 로그, 에러 트래킹(Sentry 등) |
| 보안 | Firestore 규칙 재검토, CORS/레이트 리밋, Admin SDK 정식 배포 |

### 3. 배포 · 공모전 산출물

| Jira | 할 일 | 디벨롭 포인트 |
|------|------|----------------|
| YP2026-61 | 클라우드 MVP 배포 | Frontend(Vercel/Firebase Hosting) + Backend(Cloud Run/Render) + env 시크릿 관리 |
| YP2026-62 | 기능명세서 | 화면·유스케이스·권한 문서화 (Confluence) |
| YP2026-63 | 기획서 · 발표자료 | 데모 시나리오, 아키텍처 다이어그램, 차별점 정리 |
| — | CI/CD | GitHub Actions: lint · test · develop 자동 배포 |

### 4. 에픽별 남은 체크리스트

**데이터 파이프라인 (YP2026-10)**  
- [x] Mock 거래 생성·분류  
- [x] 금감원 예·적금  
- [ ] CSV/프리셋 업로드 (47)  
- [ ] 정책금융 메타 (49)  

**디지털 트윈 (YP2026-25)**  
- [x] 시나리오 연산·UI·그래프  
- [ ] 스냅샷 영속화·불러오기 (54)  

**AI 코어 (YP2026-32)**  
- [x] 플로팅 챗봇 · fallback  
- [x] Bedrock 연동 코드 경로  
- [x] 지식 검색 도구 `search_knowledge` · 로컬 벡터 인덱스 (59 기반)  
- [ ] 상용 키 기준 안정화 (58)  
- [ ] 지식 코퍼스 확충 — 정책금융 공고 원문 (49, 59)  

**배포·산출물 (YP2026-38)**  
- [x] API 명세 (64)  
- [ ] 클라우드 배포 (61)  
- [ ] 기능명세 · 발표자료 (62, 63)  

### 5. 제안 스프린트 순서

1. **Sprint A** — 레포 커밋/`develop` 정리 + CSV·프리셋(47)  
2. **Sprint B** — 스냅샷 DB(54) + 정책금융 메타(49)  
3. **Sprint C** — Bedrock/Q&A 고도화 + 테스트  
4. **Sprint D** — MVP 배포(61) + 기능명세·발표(62, 63)  

---

## 팀 규칙 요약

- 브랜치 `main → develop → feature/*` · 커밋 `YP2026-XX 요약`
- UI 한국어 · env 프론트/백 분리 · 시크릿 미커밋
- 외부 API는 키 없이도 demo(mock/fallback) 가능 유지
- 도메인별 모듈 경계를 지켜 충돌 최소화

---

## 참고

- [금융감독원 Open API](https://finlife.fss.or.kr/finlife/main/contents.do?menuNo=700029)
- Firebase Console · AWS Bedrock Console
- 스키마 CSV: [API_schemas.csv](./docs/API_schemas.csv) · [API_overview.csv](./docs/API_overview.csv)
