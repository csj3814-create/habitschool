# 개발 교훈 (Lessons Learned)

## 2026-03-16

### 13. Service Worker Cache First → Network First 전환이 필수적인 경우
- **증상**: 시크릿 탭에서 3초, 일반 크롬에서 33초. 코드를 아무리 수정해도 일반 크롬에서 속도 개선 없음.
- **근본 원인**: 구 Service Worker가 Cache First 전략으로 오래된 JS 파일을 캐시에서 서빙. 새 SW 배포해도 브라우저가 구 SW를 계속 사용하는 동안 옛 코드가 돌아감.
- **해결**: SW를 Network First 전략으로 변경 + `skipWaiting()` + `clients.claim()` 즉시 활성화.
- **재발 방지**:
  1. SW는 반드시 **Network First** 전략 유지. Cache First로 절대 되돌리지 말 것.
  2. JS/CSS 수정 시 `CACHE_NAME` 버전 번호 증가 필수.
  3. `install` 이벤트에서 `self.skipWaiting()`, `activate` 이벤트에서 `self.clients.claim()` 반드시 포함.
  4. 배포 후 "시크릿 탭 vs 일반 탭" 속도 비교로 SW 문제 감별.

### 14. CDN 스크립트는 초기 로딩을 죽인다
- **증상**: index.html에 ethers(800KB), exif, html2canvas, kakao 등 CDN 스크립트 4개가 `defer`로 로드되지만, 파싱+실행에 모바일에서 수 초 소모.
- **해결**: 모든 CDN 스크립트를 제거하고 **사용 시점에 동적 로드** (`_loadScript` 패턴).
- **재발 방지**:
  1. index.html에 새 외부 스크립트 추가 금지. 반드시 동적 import 또는 `_loadScript()` 사용.
  2. 대시보드 렌더링에 필요하지 않은 라이브러리는 절대 초기 로드하지 말 것.
  3. 새 라이브러리 추가 시 체크리스트: "대시보드 첫 렌더에 필요한가?" → No면 lazy load.

### 15. 동적 스크립트 로드 순서: 의존성 체인 준수
- **증상**: `ethers is not defined` 에러. `blockchain-manager.js`가 전역 `ethers`에 의존하는데, ethers CDN 스크립트가 index.html에서 제거됨.
- **해결**: `_loadBlockchainModule()`에서 ethers.js CDN을 먼저 로드한 후 `blockchain-manager.js`를 import.
- **재발 방지**:
  1. 동적 모듈 로드 시 의존성 순서를 명시적으로 관리: `loadA().then(() => import(B))`.
  2. CDN 스크립트를 제거할 때 해당 전역 변수를 사용하는 모든 파일을 검색할 것 (`rg "ethers" --type js`).

### 16. 모바일 로그인 후 window.location.reload()는 필수
- **증상**: reload() 제거 시 Firestore 쿼리가 30초 이상 대기하거나 데이터를 못 가져옴. 식단/운동/마음 탭 데이터 미표시.
- **근본 원인**: 모바일 popup 로그인 시 Firebase Auth 토큰이 설정되기 전에 Firestore 쿼리가 실행되거나, WebSocket 연결 상태가 불안정.
- **해결**: `signInWithPopup` 성공 후 + `onAuthStateChanged`에서 popup 로그인 감지 시 `window.location.reload()` 호출 유지.
- **재발 방지**:
  1. `window.location.reload()`를 성능 이유로 제거하지 말 것. 이것은 Firebase Auth + Firestore 안정성에 필수.
  2. 성능 최적화는 reload 후의 로딩 속도를 줄이는 방향으로 (캐시, 병렬 쿼리, lazy loading).
  3. auth.js의 `_isPopupLogin` 플래그 + reload 패턴은 건드리지 말 것.

### 17. onAuthStateChanged에서 loadDataForSelectedDate 호출 필수
- **증상**: 식단, 운동, 마음 탭에서 오늘 올린 데이터가 표시되지 않음.
- **근본 원인**: `loadDataForSelectedDate(todayStr)` 호출이 `onAuthStateChanged`에서 제거됨.
- **해결**: `onAuthStateChanged`에서 로그인 확인 후 `window.loadDataForSelectedDate(todayStr)` 호출 복원.
- **재발 방지**:
  1. `onAuthStateChanged`의 로그인 처리 로직에서 `loadDataForSelectedDate` 호출을 제거하지 말 것.
  2. 대시보드 렌더링과는 별개로, 일별 활동 데이터 로드는 독립적으로 실행되어야 함.

### 18. Cloud Function Cold Start 대응: 타임아웃 + 폴백
- **증상**: getDashboardData CF가 cold start 시 5~15초 소요. 사용자 체감 속도 급감.
- **해결**: CF 호출에 3초 타임아웃 적용. 타임아웃 시 직접 Firestore 쿼리로 폴백.
- **재발 방지**:
  1. Cloud Function 호출은 항상 타임아웃 + 폴백 패턴 사용.
  2. 패턴: `Promise.race([cfPromise, timeoutPromise]).catch(() => directFirestore())`.
  3. 사용자 체감에 직접 영향을 주는 CF는 최대 3초 타임아웃 권장.

### 19. "시크릿 탭 vs 일반 탭" 비교는 최강 디버깅 도구
- **패턴**: 동일 기능이 시크릿에서는 정상, 일반 탭에서는 비정상이면 → **Service Worker 또는 브라우저 캐시 문제 확정**.
- **재발 방지**:
  1. 배포 후 성능 테스트는 반드시 시크릿 + 일반 두 환경에서 실행.
  2. 차이가 크면 SW 버전 확인: DevTools → Application → Service Workers에서 활성 SW 버전 확인.
  3. 차이가 없으면 서버/네트워크 문제로 방향 전환.

---

## 재발 방지 체크리스트 (배포 전 필수 확인)

- [ ] `sw.js` CACHE_NAME 버전 번호가 올라갔는가?
- [ ] sw.js 전략이 Network First인가? (Cache First로 되돌리지 않았는가?)
- [ ] index.html에 새 CDN `<script>` 태그를 추가하지 않았는가?
- [ ] dist/ 폴더에 모든 변경 파일이 동기화되었는가?
- [ ] auth.js의 `window.location.reload()` 패턴이 유지되고 있는가?
- [ ] onAuthStateChanged에서 `loadDataForSelectedDate` 호출이 있는가?
- [ ] Cloud Function 호출에 타임아웃 + 폴백이 있는가?

---

## 2026-03-16 (이전 — 주간 미션 관련)

### 6. Firestore 보안 규칙 화이트리스트 누락 → 기능 전체 먹통
- `isAllowedUserField()`에 미션 관련 필드가 없어서 프론트엔드 write가 전부 `Missing or insufficient permissions`로 거부됨
- 이 에러가 `archiveWeekAndReset`에서 throw → 대시보드 렌더링 전체 중단 → 미션 UI가 아예 안 나옴
- **교훈**: 새 사용자 필드를 프론트엔드에서 쓸 때 반드시 `firestore.rules`의 화이트리스트에 추가. 배포 후 확인 필수.

### 7. Firestore 쓰기 실패가 렌더링을 죽이면 안 됨
- `archiveWeekAndReset`의 `await setDoc()`이 throw하면 외부 try-catch에서 대시보드 전체가 중단됨
- **교훈**: Firestore 쓰기 실패가 UI 렌더링을 망가뜨리지 않도록 개별 try-catch로 감쌀 것. fire-and-forget 패턴은 `.catch(() => {})` 사용.

### 8. dist 폴더에 app.js만 동기화하면 안 됨
- `dist/` 에는 모든 파일(HTML, CSS, JS, 아이콘 등)이 동기화되어야 함
- app.js만 복사하고 나머지를 안 하면 GitHub Pages 테스트서버에서 옛 코드가 돌아감
- **교훈**: 배포 전 전체 파일 동기화. 가능하면 스크립트화.

### 9. 서비스 워커 Cache First → 코드 수정이 적용 안 됨
- SW가 정적 자산을 Cache First로 서빙 → JS 수정해도 사용자 브라우저에 옛 캐시가 남음
- 반드시 `CACHE_NAME` 버전을 올려야 새 코드가 적용됨
- **교훈**: JS/CSS 수정 시 sw.js의 `CACHE_NAME` 버전 번호 증가 필수.

### 10. 로그인은 반드시 signInWithPopup — signInWithRedirect 금지
- 이 프로젝트의 PWA/authDomain 구성에서 `signInWithRedirect`는 작동하지 않음 (과거 검증 완료, 되돌린 이력 있음)
- 모바일에서 `signInWithPopup` 시 팝업이 자동으로 닫혀 `auth/popup-closed-by-user` 에러가 나오지만, `onAuthStateChanged`가 결국 로그인을 감지함
- **교훈**: 절대 `signInWithRedirect`로 바꾸지 말 것. `popup-closed-by-user` 에러는 사용자에게 토스트를 보여주지 않고 조용히 무시.

### 11. authDomain은 절대 hosting 도메인으로 바꾸면 안 됨
- `authDomain`을 `habitschool.web.app`으로 설정하면, Android PWA에서 auth 콜백을 PWA가 가로채서 로그인이 꼬임
- `habitschool-8497b.firebaseapp.com`은 PWA scope 밖이라 안전
- **교훈**: authDomain은 절대 변경 금지. 항상 `firebaseapp.com` 유지.

### 12. 대시보드 캐시 무효화 안 하면 미션 재설정이 반영 안 됨
- `resetWeeklyMissions`에서 Firestore는 초기화했지만 `_dashboardCache`(30초 TTL)를 안 비워서 캐시된 옛 데이터로 재렌더링
- **교훈**: Firestore 데이터 변경 후 `renderDashboard()` 호출 전에 반드시 `_dashboardCache` 초기화.

### 13. main push 후 habitschool/ 메인 폴더 동기화 필수
- 워크트리(`worktrees/frosty-mclean/`)에서 작업 후 `main`에 push해도
  메인 폴더(`D:\antigravity\habitschool\`)는 자동으로 갱신되지 않음
- **교훈**: `main` push 완료 후 반드시 아래 명령 실행:
  ```
  cd D:\antigravity\habitschool && git pull origin main
  ```

---

## 2026-03-15

### 1. Promise 체인에 .catch() 누락 → 전체 기능 먹통
- `settleExpiredChallenges().then(() => updateAssetDisplay())` — settleExpiredChallenges가 에러나면 .then()이 실행 안 됨
- **교훈**: `.then()` 앞에 반드시 `.catch()` 또는 독립 실행으로 분리할 것

### 2. 순차 await는 성능 킬러
- 5개 Firestore 쿼리를 순차 `await`로 실행하면 각 ~1초 × 5 = ~5초
- 병렬 실행(`Promise.all` 또는 시작 시 동시 발사 + 필요 시 await)으로 ~1초로 개선
- **교훈**: 독립적인 쿼리는 반드시 병렬 실행

### 3. Git에 커밋 안 된 파일 확인
- 로컬 sw.js가 v64인데 GitHub Pages에서 v38 표시 → 26개 파일이 미커밋 상태
- **교훈**: 배포 전 `git status`로 미커밋 파일 확인할 것

### 4. Firebase 프로젝트 ID
- `habitschool-8497b` — .firebaserc 파일이 없어서 매번 `--project` 플래그 필요
- **교훈**: .firebaserc 설정 고려

### 5. dist 폴더 동기화
- js/ 수정 후 dist/js/에 수동 복사 필요
- **교훈**: 빌드 스크립트 또는 자동화 고려
