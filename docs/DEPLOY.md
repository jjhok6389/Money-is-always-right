# 데모 배포 가이드 (Vercel + Render)

프론트는 **Vercel**, API는 **Render Free**에 올립니다.  
로그인·Firestore는 기존 **Firebase** 프로젝트를 그대로 씁니다.

---

## 0. 사전 준비

1. 이 브랜치/`develop`에 배포용 커밋이 푸시되어 있어야 합니다.
2. Firebase Console에서 서비스 계정 키 JSON을 준비합니다.  
   (Project settings → Service accounts → Generate new private key)
3. (선택) FSS / AWS 키가 없으면 mock·fallback으로도 데모 가능합니다.

---

## 1. Render — Backend

1. [render.com](https://render.com) 로그인 → **New → Blueprint** 또는 **Web Service**
2. GitHub 레포 `Money-is-always-right` 연결
3. 설정 (Blueprint 없이 수동일 때):

| 항목 | 값 |
|------|-----|
| Root Directory | `backend` |
| Runtime | Python 3 |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Health Check Path | `/health` |

4. **Environment**에 넣을 값:

| Key | 값 |
|-----|-----|
| `FIREBASE_PROJECT_ID` | Firebase 프로젝트 ID |
| `FIREBASE_CREDENTIALS_JSON` | 서비스 계정 JSON **전체** (한 줄로 붙여넣기) |
| `ALLOW_DEMO_MODE` | `true` (키 검증 실패 시에도 띄우려면) |
| `ETF_SYNC_SCHEDULER_ENABLED` | `false` (무료 플랜 권장) |
| `CORS_ORIGINS` | Vercel URL (예: `https://xxx.vercel.app`) — `*.vercel.app`은 코드에서 regex로도 허용 |
| `FSS_API_KEY` | 있으면 실연동, 없으면 비움(mock) |
| `AWS_*` / Bedrock | 있으면 실코치, 없으면 fallback |

5. Deploy → URL 확인  
   예: `https://money-api.onrender.com`  
   브라우저에서 `https://…/health` 가 `ok`면 성공.

> Free 플랜은 **약 15분 미사용 시 슬립**합니다. 첫 요청이 30~60초 걸릴 수 있습니다.

---

## 2. Vercel — Frontend

1. [vercel.com](https://vercel.com) → **Add New Project** → 같은 GitHub 레포
2. 설정:

| 항목 | 값 |
|------|-----|
| Root Directory | `frontend` |
| Framework Preset | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |

3. **Environment Variables** (Production):

로컬 `frontend/.env`와 동일하게 `VITE_FIREBASE_*` 전부 +

| Key | 값 |
|-----|-----|
| `VITE_API_BASE_URL` | Render URL (끝 슬래시 없이) 예: `https://money-api.onrender.com` |

4. Deploy → 프론트 URL 확인  
   예: `https://money-is-always-right.vercel.app`

---

## 3. Firebase — 허용 도메인

Firebase Console → **Authentication** → **Settings** → **Authorized domains**

- Vercel 도메인 추가 (예: `money-is-always-right.vercel.app`)
- `localhost`는 기본으로 있음

---

## 4. 제출용 체크

1. 시크릿 창/시크릿 모드에서 배포 URL 접속
2. 회원가입 또는 데모 계정 로그인
3. 대시보드 · 시뮬레이션 · 코치 한 번씩 확인
4. 기능명세서의 **배포 URL** 칸에 Vercel 주소 기재

---

## 트러블슈팅

| 증상 | 조치 |
|------|------|
| CORS 에러 | Render에 `CORS_ORIGINS`에 프론트 URL 추가 후 Redeploy |
| 로그인 후 API 401 | `FIREBASE_CREDENTIALS_JSON` / `FIREBASE_PROJECT_ID` 확인 |
| Firebase `auth/unauthorized-domain` | Authorized domains에 Vercel 호스트 추가 |
| API 첫 호출 타임아웃 | Render Free 웨이크업 — 한 번 `/health` 치고 재시도 |
| 빌드 후 API가 localhost | Vercel env의 `VITE_API_BASE_URL` 누락 → 다시 빌드 |
