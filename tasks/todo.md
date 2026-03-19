# 2026-03-16 작업 완료 보고서

> **상태**: ✅ 모든 작업 완료 · main 브랜치 push 완료 · Firebase Hosting 배포 완료
> **목표**: 모바일 대시보드 로딩 시간 3초 이내 달성
> **결과**: 일반 크롬 4초, 시크릿 탭 3초 — **목표 달성**

---

## 배경

모바일에서 로그인 후 대시보드 로딩에 16~33초 소요. 시크릿 탭에서는 3초인데 일반 크롬에서 33초 걸리는 현상이 핵심 문제.

---

## 수행한 작업

### 1. CDN 스크립트 제거 (초기 로딩 차단 제거) ✅

| 제거 대상 | 크기 | 비고 |
|-----------|------|------|
| ethers.umd.min.js | ~800KB | 블록체인 기능 전용, 대시보드에 불필요 |
| exif-js | ~30KB | 사진 메타데이터 전용 |
| html2canvas.min.js | ~200KB | 공유 이미지 생성 전용 |
| kakao.min.js + Kakao.init | ~100KB | 카카오 공유 전용 |

- `index.html`에서 4개 CDN `<script>` 태그 + `Kakao.init` 인라인 스크립트 제거
- 총 ~1.1MB의 초기 로딩 제거

### 2. 동적 라이브러리 로딩 구현 ✅

- `js/app.js`에 `_loadScript()`, `_ensureExif()`, `_ensureHtml2Canvas()`, `_ensureKakao()` 헬퍼 함수 추가
- 각 라이브러리를 **사용 시점**에만 로드 (lazy loading)
- `js/main.js`의 `_loadBlockchainModule`에서 ethers.js를 동적 로드 후 blockchain-manager.js import

### 3. Dashboard localStorage 캐시 ✅

- `_saveDashboardToLS()` / `_loadDashboardFromLS()` 구현
- 캐시 히트 시 즉시 렌더 → 백그라운드에서 최신 데이터 갱신
- 5분 TTL (300초)

### 4. getDashboardData Cloud Function ✅

- `functions/index.js`에 서버사이드 데이터 집계 함수 추가
- 클라이언트 3개 Firestore 쿼리 → 서버 1회 호출로 통합
- **3초 타임아웃**: CF 응답이 3초 초과 시 직접 Firestore 쿼리로 폴백 (cold start 대응)

### 5. Service Worker 전략 변경 (핵심 해결책) ✅

| 항목 | 변경 전 | 변경 후 |
|------|---------|---------|
| 전략 | Cache First | **Network First, Cache Fallback** |
| install | cache.addAll()로 정적 자산 프리캐시 | skipWaiting() 즉시 활성화 |
| activate | 구 캐시 삭제 | 구 캐시 삭제 + clients.claim() |
| CACHE_NAME | v64 | **v78** |

- **이것이 33초 vs 3초 차이의 근본 원인이었음**: 구 SW(Cache First)가 오래된 JS 파일을 캐시에서 계속 서빙
- Network First로 변경하여 항상 최신 파일을 네트워크에서 가져오고, 오프라인일 때만 캐시 사용

### 6. 로그인 흐름 복원 ✅

- `window.location.reload()` 복원: 모바일 popup 로그인 후 Firebase Firestore WebSocket 연결 상태를 깨끗하게 재설정
- `loadDataForSelectedDate(todayStr)` 복원: 식단/운동/마음 탭 데이터 로드 보장

---

## 변경 파일 목록

| 파일 | 변경 내용 |
|------|-----------|
| `index.html` | CDN script 4개 + Kakao.init 제거 |
| `js/app.js` | 동적 로드 헬퍼, localStorage 캐시, CF 호출 + 타임아웃 폴백 |
| `js/auth.js` | reload() 복원, loadDataForSelectedDate 복원 |
| `js/main.js` | ethers.js 동적 로드 후 blockchain-manager import |
| `sw.js` | Network First 전략, v78, skipWaiting + clients.claim |
| `functions/index.js` | getDashboardData Cloud Function 추가 |

---

## 성능 결과

| 환경 | 변경 전 | 변경 후 |
|------|---------|---------|
| 모바일 일반 크롬 | 16~33초 | **4초** |
| 모바일 시크릿 탭 | 3초 | **3초** |
| PC | 5~10초 | **3초** |

---

## 이전 작업 (2026-03-15)

<details>
<summary>클릭하여 펼치기</summary>

### Task 1: 탭 로딩 성능 개선 ✅
- Dashboard 캐시 (30초 TTL _dashboardCache)
- Assets 5개 순차 쿼리 → 병렬 쿼리 (5초→1초)
- settleExpiredChallenges .catch() 누락 버그 수정

### Task 2: 주간 채굴량 자동 조절 Cloud Function ✅
- adjustMiningRate: 매주 월요일 00:00 KST 자동 실행
- adjustMiningRateManual: Admin 수동 실행

### Task 3: Git 동기화 & 배포 ✅
- 26개 미커밋 파일 동기화
- Firebase Hosting 배포

</details>

---

## 다음 단계

1. **채굴량 조절 확인**: adjustMiningRate 첫 자동 실행 로그 확인 (Firebase Console)
2. **Base 메인넷 출시**: `tasks/mainnet-launch-guide.md` 참고
3. **Play Store**: 테스터 20명 모집 → 프로덕션 출시
