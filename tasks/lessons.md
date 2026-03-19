# 개발 교훈 (Lessons Learned)

---

## 2026-03-20 (코드 리뷰 & 인프라 정리 세션)

### 20. 전체 코드 리뷰는 숨겨진 버그를 한꺼번에 드러낸다
- `/octo:review`로 앱 전체를 체계적으로 탐색하니 단발성 작업 중 놓쳤던 버그 7개가 한 세션에 발견됨
- **교훈**: 기능 개발이 어느 정도 안정되면 주기적으로 전체 코드 리뷰를 실행할 것. 파일 단위 검토보다 아키텍처 수준 시각에서 보면 다른 버그가 보인다.

### 21. UI에 비율을 하드코딩하면 Phase 변경 시 사용자를 기만한다
- `main.js`에서 HBT 변환 미리보기가 `const hbt = amount; // Era A: 1:1`로 고정되어 있었음
- Phase 2(35M HBT 누적) 진입 시 사용자는 "100P → 100 HBT"를 보지만 실제로는 50 HBT만 수령
- **교훈**: 온체인/서버에서 결정되는 값(비율, 한도, 단가)을 UI에 절대 하드코딩하지 말 것.
  로드 시 API로 가져와 캐시하고(`window._currentConversionRate`), UI는 캐시된 값을 사용.

### 22. 상태 누산기(accumulator)는 반드시 리셋 시점을 명확히 정의해야 한다
- `_stakePctAccum`이 챌린지 패널 열기/닫기 사이에 리셋되지 않아 이전 시도의 % 값이 잔류
- **교훈**: 누산 상태는 초기화 트리거를 명시적으로 설계할 것. "언제 리셋되는가?"를 코드 주석으로 문서화.

### 23. CDN 동적 로드에 SRI(Subresource Integrity) 없으면 공급망 공격에 무방비
- `_loadScript(url)` 패턴으로 exif-js, html2canvas, ethers.js를 로드할 때 `integrity` 속성 없음
- CDN 서버 침해 시 악성 JS가 사용자 브라우저에서 실행 가능
- **교훈**: CDN 스크립트 동적 로드 시 `integrity` + `crossOrigin = 'anonymous'` 필수.
  `_loadScript(url, integrity, crossOrigin)` 시그니처로 확장하여 강제화.
  SRI 해시는 cdnjs API 또는 `curl <url> | openssl dgst -sha512 -binary | openssl base64 -A`로 계산.

### 24. 버전 미고정 CDN URL은 조용한 시한폭탄
- `https://cdn.jsdelivr.net/npm/exif-js`처럼 버전 없이 로드하면 CDN이 최신 버전을 임의로 서빙
- 라이브러리 메이저 업데이트 시 API 변경으로 앱이 조용히 깨질 수 있음
- **교훈**: CDN URL에는 반드시 버전 고정 (`@2.3.0`). SRI 해시와 함께 사용하면 이중 보호.

### 25. dist/ 폴더는 배포 전략이 확정되면 과감히 제거하라
- 테스트 서버 = GitHub, 본서버 = Firebase 직접 배포 구조에서 dist/는 불필요한 복사본
- dist/ 유지 시 항상 수동 동기화가 필요해 Lessons #5, #8 같은 실수가 반복됨
- **교훈**: 배포 구조 확정 후 중간 산출물(dist/)은 git에서 제거하고 `.gitignore`에 추가.
  `git rm --cached -r dist/`로 추적만 제거 (파일 삭제 없음), 이후 `git pull`이 물리 파일도 정리.

### 26. .firebaserc 없으면 배포할 때마다 --project 플래그를 입력해야 한다
- 매 `firebase deploy` 마다 `--project habitschool-8497b`를 붙여야 했음 (Lesson #4 실제 해결)
- **교훈**: 프로젝트 루트에 `.firebaserc` 파일 생성 후 기본 프로젝트 등록. 커밋해서 팀 공유.
  ```json
  { "projects": { "default": "habitschool-8497b" } }
  ```

### 27. git worktree 사용 시 메인 폴더는 자동 동기화되지 않는다
- 워크트리(`worktrees/frosty-mclean/`)에서 `main`에 push해도 `habitschool/`은 그대로
- **교훈**: `main` push 완료 후 반드시 메인 폴더에서 pull:
  ```
  cd D:\antigravity\habitschool && git pull origin main
  ```

### 28. deprecated API는 발견 즉시 제거한다 — 나중은 없다
- `document.execCommand('copy')`가 copyWalletAddress fallback에 남아 있었음 (이미 deprecated)
- **교훈**: deprecated 경고가 발생하는 API는 그 세션에 바로 제거. fallback이 없으면 toast/alert로 사용자에게 안내.

---

## 2026-03-16 (성능 최적화 & 안정성 세션)

### 13. Service Worker Cache First → Network First 전환이 필수적인 경우
- **증상**: 시크릿 탭에서 3초, 일반 크롬에서 33초. 코드를 아무리 수정해도 일반 크롬에서 속도 개선 없음.
- **근본 원인**: 구 Service Worker가 Cache First 전략으로 오래된 JS 파일을 캐시에서 서빙.
- **해결**: SW를 Network First 전략으로 변경 + `skipWaiting()` + `clients.claim()` 즉시 활성화.
- **재발 방지**:
  1. SW는 반드시 **Network First** 전략 유지. Cache First로 절대 되돌리지 말 것.
  2. JS/CSS 수정 시 `CACHE_NAME` 버전 번호 증가 필수.
  3. `install`에서 `self.skipWaiting()`, `activate`에서 `self.clients.claim()` 반드시 포함.
  4. 배포 후 "시크릿 탭 vs 일반 탭" 속도 비교로 SW 문제 감별.

### 14. CDN 스크립트는 초기 로딩을 죽인다
- **증상**: index.html에 ethers(800KB), exif, html2canvas, kakao 등 CDN 스크립트가 `defer`로 로드되지만 모바일에서 수 초 소모.
- **해결**: 모든 CDN 스크립트를 제거하고 **사용 시점에 동적 로드** (`_loadScript` 패턴).
- **재발 방지**:
  1. index.html에 새 외부 스크립트 추가 금지. 반드시 동적 import 또는 `_loadScript()` 사용.
  2. 새 라이브러리 추가 시: "대시보드 첫 렌더에 필요한가?" → No면 lazy load.

### 15. 동적 스크립트 로드 순서: 의존성 체인 준수
- **증상**: `ethers is not defined` 에러.
- **해결**: `_loadBlockchainModule()`에서 ethers.js CDN 먼저 로드 후 `blockchain-manager.js` import.
- **재발 방지**: `loadA().then(() => import(B))` 패턴으로 의존성 순서 명시적 관리.

### 16. 모바일 로그인 후 window.location.reload()는 필수
- **증상**: reload() 제거 시 Firestore 쿼리가 30초 이상 대기, 데이터 미표시.
- **교훈**: `window.location.reload()`를 성능 이유로 제거하지 말 것. auth.js의 `_isPopupLogin` + reload 패턴은 건드리지 말 것.

### 17. onAuthStateChanged에서 loadDataForSelectedDate 호출 필수
- **교훈**: `onAuthStateChanged` 로그인 처리에서 `loadDataForSelectedDate` 호출을 제거하지 말 것.

### 18. Cloud Function Cold Start 대응: 타임아웃 + 폴백
- **해결**: CF 호출에 5초 타임아웃 적용. 타임아웃 시 직접 Firestore 쿼리로 폴백.
- **패턴**: `Promise.race([cfPromise, timeoutPromise]).catch(() => directFirestore())`

### 19. "시크릿 탭 vs 일반 탭" 비교는 최강 디버깅 도구
- 시크릿=정상, 일반=비정상 → **Service Worker 또는 브라우저 캐시 문제 확정**.
- DevTools → Application → Service Workers에서 활성 SW 버전 확인.

### 12. 대시보드 캐시 무효화 안 하면 미션 재설정이 반영 안 됨
- **교훈**: Firestore 데이터 변경 후 `renderDashboard()` 호출 전 `_dashboardCache` 초기화 필수.

### 11. authDomain은 절대 hosting 도메인으로 바꾸면 안 됨
- **교훈**: authDomain은 항상 `habitschool-8497b.firebaseapp.com` 유지. `habitschool.web.app`으로 바꾸면 Android PWA 로그인 꼬임.

### 10. 로그인은 반드시 signInWithPopup — signInWithRedirect 금지
- **교훈**: `signInWithRedirect`는 이 프로젝트에서 작동하지 않음. `popup-closed-by-user` 에러는 조용히 무시.

### 9. JS/CSS 수정 시 sw.js CACHE_NAME 버전 번호 증가 필수
- **교훈**: SW `CACHE_NAME` 버전이 같으면 사용자 브라우저에 옛 캐시가 계속 남음.

### 8. ~~dist 폴더 동기화~~ → ✅ 해결됨 (2026-03-20 dist/ 완전 제거)
- dist/ 폴더 자체를 git에서 제거하고 .gitignore에 추가하여 근본 해결.

### 7. Firestore 쓰기 실패가 렌더링을 죽이면 안 됨
- **교훈**: Firestore 쓰기 실패가 UI 전체를 중단시키지 않도록 개별 try-catch 또는 `.catch(() => {})` 사용.

### 6. Firestore 보안 규칙 화이트리스트 누락 → 기능 전체 먹통
- **교훈**: 새 사용자 필드 추가 시 `firestore.rules`의 `isAllowedUserField()` 화이트리스트에 반드시 추가.

---

## 2026-03-15 (초기 개발 세션)

### 5. ~~dist 폴더 동기화~~ → ✅ 해결됨 (2026-03-20)

### 4. ~~.firebaserc 없음~~ → ✅ 해결됨 (2026-03-20 .firebaserc 추가)

### 3. 배포 전 git status로 미커밋 파일 확인
- **교훈**: `git status`로 미커밋 파일 없는지 확인 후 배포.

### 2. 순차 await는 성능 킬러
- **교훈**: 독립적인 Firestore 쿼리는 `Promise.all`로 병렬 실행.

### 1. Promise 체인에 .catch() 누락 → 전체 기능 먹통
- **교훈**: `.then()` 체인 앞에 반드시 `.catch()` 또는 독립 실행으로 분리.

---

## 배포 전 필수 체크리스트

- [ ] `sw.js` CACHE_NAME 버전 번호가 올라갔는가?
- [ ] sw.js 전략이 Network First인가? (Cache First 금지)
- [ ] index.html에 새 CDN `<script>` 태그를 추가하지 않았는가?
- [ ] 새 CDN 스크립트에 `integrity` + `crossOrigin` 속성이 있는가?
- [ ] auth.js의 `window.location.reload()` 패턴이 유지되고 있는가?
- [ ] onAuthStateChanged에서 `loadDataForSelectedDate` 호출이 있는가?
- [ ] Cloud Function 호출에 타임아웃 + 폴백이 있는가?
- [ ] main push 후 `cd D:\antigravity\habitschool && git pull origin main` 실행했는가?
