# 개발 교훈 (Lessons Learned)

---
## 2026-04-03 (로컬 포인트 적립 미반영 수정)

### 59. Cloud Functions에서는 `admin.firestore.FieldValue.*`에 기대지 말고 `firebase-admin/firestore`의 `FieldValue`를 직접 써야 한다
- **증상**: `daily_logs`는 저장되는데 `awardPoints` 트리거가 `Cannot read properties of undefined (reading 'increment')`로 깨져 `users.coins`가 오르지 않았다.
- **근본 원인**: 이 프로젝트의 emulator/runtime 조합에서는 `admin.firestore.FieldValue`가 항상 안전하게 보장되지 않았고, 특히 Firestore 트리거 실행 시 `increment`, `serverTimestamp`, `delete` 호출이 중간에 터졌다.
- **교훈**: Cloud Functions에서 Firestore sentinel 값을 쓸 때는 `const { FieldValue } = require("firebase-admin/firestore")`를 import하고, 코드 전반에서 `FieldValue.increment()`, `FieldValue.serverTimestamp()`, `FieldValue.delete()`처럼 직접 사용해야 한다. 포인트/보상처럼 트리거 기반 누적 로직은 emulator 로그까지 반드시 확인해 실제 반영을 증명해야 한다.

## 2026-04-03 (신규 계정 로컬 저장 검증)

### 57. 기존 계정만 확인하고 끝내지 말고 신규 가입 계정으로도 저장 흐름을 검증해야 한다
- **증상**: 기존 계정에서는 로컬 저장이 되는 것처럼 보였지만, 새 계정에서는 로그인 직후 지갑 초기화가 `PERMISSION_DENIED`로 실패했다.
- **근본 원인**: `users/{uid}` 규칙 화이트리스트에 실제 신규 사용자 초기화 필드(`walletCreatedAt`, `encryptedKey`, `walletIv`, `walletVersion`, `createdAt`)가 빠져 있었다.
- **교훈**: Auth/온보딩/지갑 생성처럼 “처음 한 번만” 타는 경로는 기존 계정 회귀만으로는 놓친다. 로컬 검증 체크리스트에 **신규 가입 계정 1회 저장**을 반드시 포함한다.

### 58. 로컬 emulator를 쓸 때는 Storage URL 검증이 운영 URL만 통과시키지 않는지 확인해야 한다
- **증상**: Storage Emulator 업로드는 성공했지만, 저장된 사진 URL이 `http://127.0.0.1:9199/...` 형태라 UI가 “유효하지 않은 URL”로 판단해 사진을 복원하지 못했다.
- **근본 원인**: `isValidStorageUrl`와 일부 저장/분석 로직이 `firebasestorage.googleapis.com`만 허용하도록 하드코딩돼 있었다.
- **교훈**: staging/local 검증 환경을 도입하면 URL/도메인 검증도 함께 환경 인지형으로 바꿔야 한다. Storage/Hosting/Auth URL 검증은 운영 도메인만 전제하지 말 것.


## 2026-03-26 (모바일 버그 수정 + 성능 개선 세션)

### 43. UI 로딩 상태는 모든 종료 경로(성공/실패/빈 데이터)에서 반드시 해제해야 한다
- **증상**: 내 지갑 탭 스켈레톤이 가끔 영구히 표시됨. 재방문 시 정상(30초 캐시 히트 경로 사용).
- **근본 원인**: `updateAssetDisplay`의 catch 블록과 `userSnap.exists() === false` 분기에 `hideWalletSkeleton()` 호출 없음.
- **교훈**: 스켈레톤/로딩 UI를 보여주면 반드시 모든 종료 경로에서 해제할 것.
  성공 경로 외에 **에러 경로, 빈 데이터 경로** 모두 점검. `finally` 블록 활용 권장.

### 44. 블록체인/외부 모듈 로드와 Firestore UI 데이터 로드는 완전히 분리해야 한다
- **증상**: 내 지갑 탭 첫 로딩이 20초 걸림. ethers.js CDN + blockchain-manager + 온체인 호출이 완료되어야 Firestore 쿼리가 시작되는 구조.
- **교훈**: 외부 의존성(CDN, 블록체인 RPC)이 필요한 작업과 독립적인 작업(Firestore)을 순서에 묶지 말 것.
  1. Firestore 데이터 즉시 표시 → 사용자 체감 로딩 1~2초
  2. 블록체인 모듈은 백그라운드에서 별도 로드 → 완료 후 온체인 데이터만 업데이트

### 45. 갤러리 필터는 사진/텍스트 없는 기록도 포함해야 한다
- **증상**: 갤러리 탭에서 "아직 기록이 없어요" 표시. 실제로는 steps(만보기), meditationDone(명상 체크) 기록이 있음.
- **근본 원인**: `hasMediaForFilter`가 사진 URL, 텍스트만 체크하고 steps.count, meditationDone은 무시.
- **교훈**: 갤러리에 표시할 "의미 있는 기록" 정의를 명확히 할 것. 사진/영상/텍스트 없어도 활동 기록(걸음수, 명상 체크)이 있으면 표시.

### 46. fetchOnchainBalance 실패 시 0을 표시하면 안 된다
- **증상**: 내 지갑 첫 로딩 시 HBT가 "0 HBT"로 잠깐 표시됐다가 정확한 값으로 바뀜.
- **근본 원인**: `fetchOnchainBalance` null 반환 또는 에러 시 강제로 "0 HBT" innerHTML 설정.
- **교훈**: 외부 API 호출 실패/null 응답 시 "미확인 상태(조회 중...)"를 유지할 것. 실제 0인지 조회 실패인지 구분 불가능할 때 0을 표시하면 사용자를 오도.

### 47. 비동기 archive 함수가 유저 저장을 race condition으로 덮어쓸 수 있다
- **증상**: 주간 미션을 설정해도 자꾸 해제됨. 여러 번 설정해도 반복 발생.
- **근본 원인**: 새 주 첫 방문 시 LS 캐시의 지난주 데이터로 `archiveWeekAndReset`이 비동기 실행 시작. 유저가 미션 저장(`saveWeeklyMissions`)을 완료한 후에 archive의 Firestore `setDoc`이 완료되며 새 미션을 null로 덮어씀.
  - 레이스 윈도우: archive 시작(렌더) → 유저 저장 → archive Firestore 쓰기 완료(null)
- **수정**:
  1. `archiveWeekAndReset`: setDoc 전 `getDoc`으로 현재 weekId 확인 → 이미 새 주차 미션이면 null 덮어쓰기 생략
  2. `_archivedWeekIds` Set으로 같은 weekId에 대한 archive 중복 호출 차단
- **교훈**: 비동기로 백그라운드 실행되는 "정리 함수"는 반드시 조건부 쓰기(read-then-write)로 구현할 것. 유저 액션이 먼저 완료됐을 가능성을 항상 고려해야 한다.

### 48. PIL에서 한국어 폰트 렌더링 시 malgun.ttf(일반체)는 특정 글자를 깨뜨린다
- **증상**: feature-graphic 이미지에서 "받" 글자가 이상하게 렌더링됨.
- **근본 원인**: `malgun.ttf`(일반체)는 특정 크기(22~26px)에서 "받" 등 일부 한국어 글자를 잘못 렌더링. `malgunbd.ttf`(굵은체)는 동일 크기에서 정상 렌더링.
- **교훈**: Windows PIL 이미지 생성에서 한국어 텍스트는 `malgunbd.ttf`(굵은체)를 기본으로 사용할 것. 일반체 사용 시 사이즈별로 글자 깨짐 여부 반드시 확인.

---

## 2026-03-25 (모바일 갤러리 버그 수정 세션 #2)

### 37. async 함수 내 try/catch 바깥의 await는 스켈레톤 고착을 유발한다
- **증상**: 갤러리 탭이 가끔 스켈레톤(회색 플레이스홀더) 상태에서 멈춰 데이터가 표시되지 않음.
- **근본 원인**: `_loadGalleryDataInner()`에서 스켈레톤을 보여준 직후 `getDoc()` 호출이 try/catch 바깥에 위치.
  Firestore 연결 불안정 시 해당 `await`에서 throw → 함수 종료 → 스켈레톤이 DOM에 영구 잔류.
- **교훈**:
  1. 스켈레톤/로딩 UI를 보여준 이후의 모든 async 작업은 예외 없이 try/catch로 보호.
  2. 중요한 비동기 함수 전체를 최상단 try/catch로 래핑해 안전망 구축. 어떤 예외도 로딩 상태를 고착시키면 안 됨.
  3. "보조 데이터"(친구 목록 등) 실패는 무시하고 메인 데이터 렌더링은 계속 진행.

### 38. 같은 기능이 두 탭에 있으면 디자인을 반드시 일치시켜야 한다
- **증상**: 자산 탭 친구 초대 박스가 프로필 탭과 다른 디자인(버튼 스타일, 초대 코드 표시 없음).
- **교훈**: 동일한 기능 컴포넌트가 두 곳 이상에 있을 때:
  1. 한 곳을 수정하면 나머지도 반드시 동기화.
  2. 가능하면 공통 함수/HTML 템플릿으로 추출해 단일 소스 유지.
  3. 신규 기능(초대 코드 표시 등) 추가 시 모든 진입점에 동시 반영.

---

## 2026-03-25 (커뮤니티 활성화 + 초대 시스템 세션)

### 35. Firestore rules 변경은 git commit만으로는 안 된다 — firebase deploy 필수
- **증상**: `isAllowedUserField()`에 `referralCode` 추가 후 commit/push 했지만 실제 Firestore는 여전히 권한 거부.
- **교훈**: Firestore rules, Storage rules 변경은 반드시 `firebase deploy --only firestore:rules` (또는 `storage`) 별도 실행 필요.
  git commit은 코드 저장일 뿐, 규칙 반영은 firebase deploy가 해야 함.
- **체크리스트 추가**: 새 Firestore 필드 추가 → rules 화이트리스트 추가 → **firebase deploy --only firestore:rules** 포함해서 배포

### 36. try/catch 범위를 최소화할 것 — 관련 없는 코드를 같은 catch에 묶지 말 것
- **증상**: 복호화 성공 후 `updateDoc(referralCode)` 실패가 "v2 지갑 복호화 실패"로 잘못 로깅됨.
  사용자에게는 복호화 에러로 오해될 수 있고, referralCode 저장 실패는 조용히 묻힘.
- **교훈**: try/catch 블록은 목적별로 분리할 것.
  복호화 로직 → 복호화 전용 catch. 저장 로직 → 저장 전용 catch.
  서로 다른 실패 케이스를 같은 catch에 묶으면 에러 진단이 불가능해짐.

---

## 2026-03-22 (걸음수 기능 추가 & 갤러리 지연 수정 세션)

### 29. Gemini 모델: gemini-2.0-flash 사용 금지 — 반드시 gemini-2.5-flash만 사용
- **증상**: `gemini-2.0-flash` 모델이 deprecated되어 Cloud Function에서 404 에러 발생.
- **교훈**: **gemini-2.0-flash는 절대 사용하지 말 것.** 모든 Gemini API 호출은 `gemini-2.5-flash`만 사용.
  단순 OCR 등 thinking이 불필요한 작업은 `thinkingConfig: { thinkingBudget: 0 }`으로 thinking 비활성화.

### 30. 배포 순서: 반드시 git commit → push → 사용자 확인 → firebase deploy
- **증상**: 코드 변경 후 바로 `firebase deploy`하여 검증되지 않은 코드가 프로덕션에 배포됨.
  Storage 규칙 누락, SDK 버전 불일치, 모델 deprecated 등 연쇄 에러 발생.
- **교훈**: 서버 배포 순서를 반드시 지킬 것:
  1. `git add` + `git commit`
  2. `git push origin main`
  3. **사용자에게 확인 요청**
  4. 확인 받은 후에만 `firebase deploy --only hosting,functions`
- **절대 금지**: 사용자 확인 없이 `firebase deploy` 실행.

### 31. Firebase Storage 보안 규칙에 새 경로 추가를 잊지 말 것
- **증상**: `step_screenshots/` 경로가 `storage.rules`에 없어서 업로드 시 403 Forbidden 에러.
- **교훈**: 새로운 Storage 경로를 코드에 추가할 때 반드시 `storage.rules`에도 해당 경로 규칙 추가.
  `firestore.rules` (Lesson #6)과 동일한 패턴. **체크리스트에 추가.**

### 32. Firebase SDK 버전은 프로젝트 전체에서 반드시 통일
- **증상**: 앱 전체는 `firebase 10.8.0`인데 걸음수 코드에서 `11.6.0`을 동적 import.
  서로 다른 버전의 SDK는 Firebase 앱 인스턴스를 공유하지 못해 업로드가 무한 대기(hang).
- **교훈**: 동적 import로 Firebase SDK를 새로 로드하지 말 것.
  이미 top-level에서 import된 모듈(`ref`, `uploadBytes`, `getDownloadURL` 등)을 직접 사용.
  새 Firebase 모듈이 필요하면 기존 import 블록에 추가.

### 33. canvas.toBlob()은 null을 반환할 수 있다 — 반드시 null 체크
- **증상**: `compressImage`에서 `canvas.toBlob()` 콜백의 `blob`이 null이었고,
  `blob.size` 접근 시 TypeError 발생. Promise가 resolve도 reject도 안 되어 전체 hang.
- **교훈**: `canvas.toBlob()` 콜백에서 `blob`이 null인 경우 원본 파일로 fallback.
  Promise 내부에서는 모든 경로가 resolve 또는 reject에 도달하는지 반드시 확인.

### 34. 작업 완료 후 반드시 에러 검증 — 면밀한 분석 후 배포
- **증상**: 기능 구현 후 테스트 없이 "완료"로 보고. Storage 규칙 누락, SDK 버전 불일치,
  모델 deprecated 등 3개 연쇄 에러가 사용자에게 그대로 노출됨.
- **교훈**: 작업 완료 시 반드시:
  1. 코드 변경이 의존하는 모든 인프라(Storage rules, Firestore rules, CF 배포) 점검
  2. 새 import/경로 추가 시 기존 버전/규칙과 충돌 없는지 확인
  3. 단순하게 생각하지 말고 면밀하게 분석 후 배포
  4. 에러 발생 시 근본 원인까지 완벽히 해결

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

## 2026-03-27 (식단 사진 저장 버그 시리즈)

### 45. 빈 img.src는 페이지 URL을 반환한다 — Firebase URL 반드시 검증
- **증상**: 식단 사진 없는 슬롯(lunch/dinner/snack)에 `https://habitschool.web.app/`이 저장됨.
- **근본 원인**: `<img src="">` 태그의 `.src` 속성은 비어있을 때 브라우저가 현재 페이지 URL을 반환. `url.startsWith('https://')` 체크만으로는 실제 Firebase URL과 구분 불가.
- **교훈**: Firebase Storage URL 검증은 반드시 `url.includes('firebasestorage.googleapis.com')`으로 할 것. `startsWith('https://')` 만으로는 부족.

### 46. clearInputs()가 data-saved-url을 초기화하지 않으면 날짜 간 데이터 오염
- **증상**: 전날 데이터를 보고 오늘로 돌아와 저장하면 전날 사진 URL이 오늘 빈 슬롯에 저장됨.
- **근본 원인**: 날짜 변경 시 `clearInputs()`가 `preview.src`와 `display`는 초기화하지만 `data-saved-url` 커스텀 속성은 유지. 새 날짜에 해당 슬롯에 사진이 없으면 `data-saved-url`에 이전 날짜 URL이 남아있음.
- **교훈**: DOM에 커스텀 데이터를 캐시할 때는 반드시 초기화 함수에서도 함께 제거할 것. `clearInputs()`에 `removeAttribute('data-saved-url')` 추가.

### 47. 저장 후 loadDataForSelectedDate 재호출은 화면을 망친다
- **증상**: 저장 3초 후 사진이 사라졌다 다시 나타나는 현상. 일부 슬롯 사진 소실.
- **근본 원인**: 저장 직후 백그라운드 `loadDataForSelectedDate` 호출 → `getDoc`이 stale 데이터 반환 → `clearInputs()`로 화면 초기화 → 사진 복원 실패.
- **교훈**: 저장 성공 후 UI는 이미 올바른 상태. `loadDataForSelectedDate`를 재호출할 필요 없음. 필요한 UI 업데이트(퀘스트 체크 등)만 저장된 데이터로 직접 갱신할 것.

### 48. Firestore rules 화이트리스트에 새 필드 추가를 빠뜨리지 말 것
- **증상**: `checkMilestones`에서 `currentStreak` 필드 저장 시 Missing permissions 에러.
- **근본 원인**: `isAllowedUserField()` 화이트리스트에 `currentStreak` 누락.
- **교훈**: 새 필드를 users 컬렉션에 쓸 때 반드시 `firestore.rules`의 `hasOnly([...])` 목록에 추가. 배포 전 체크리스트 항목.

### 49. Firestore getDoc 타임아웃 fallback은 oldData가 비어있다는 뜻 — 기존 URL은 DOM에서 읽어야
- **증상**: 모바일에서 저장 시 사진이 지워짐. Firestore getDoc 2초 타임아웃으로 oldData가 빈 채로 진행.
- **근본 원인**: `getUrlWithThumb`가 `oldUrl`(from oldData)만 보고 기존 URL을 판단. 타임아웃 시 oldData 빈 값 → url: null → 사진 삭제.
- **교훈**: Firestore 타임아웃 fallback 패턴 사용 시, 기존 URL은 반드시 DOM(`data-saved-url`)에서도 읽어야 함. 우선순위: oldData → data-saved-url → previewImg.src (Firebase URL만).

---

## 2026-03-27 (갤러리 페이지네이션 & 무한 스크롤 버그 시리즈)

### 50. 갤러리 Firestore 커서 페이지네이션 — MAX_CACHE_SIZE와 초기 fetch를 분리해야 한다
- **증상**: MAX_CACHE_SIZE=30, 커트오프 7일 → 사용자 많으면 2~3일치만 보임.
- **근본 원인**: 초기 fetch limit과 총 캐시 한도를 같은 상수로 묶어 둠. limit을 늘리면 초기 로딩이 느려지는 트레이드오프 발생.
- **해결**: `FIRESTORE_PAGE_SIZE=30` (빠른 초기 fetch) + `MAX_CACHE_SIZE=300` (총 한도) 분리. `startAfter` 커서로 스크롤 시마다 다음 30개 fetch.
- **교훈**: "초기 로딩 속도"와 "최대 표시 범위"는 서로 다른 요구. 한 상수로 두 요구를 동시에 충족할 수 없음. 반드시 분리.

### 51. IntersectionObserver.disconnect() 후 null 처리를 안 하면 재연결이 영구 차단된다
- **증상**: 갤러리 유저 필터 해제 후 스크롤해도 추가 기록이 로드 안 됨.
- **근본 원인**: `galleryIntersectionObserver.disconnect()`는 호출하지만 변수를 `null`로 안 만듦. `renderFeedOnly()`의 `if (!galleryIntersectionObserver) setupInfiniteScroll()` 조건이 항상 false → observer 재연결 불가.
- **해결**: `_disconnectGalleryObserver()` 헬퍼를 만들어 disconnect + null 처리를 항상 함께 수행. `_reconnectGalleryObserver()`는 항상 새 인스턴스로 교체.
- **교훈**: Observer/Timer/Listener를 해제할 때 변수를 반드시 null로 초기화할 것. "해제됐지만 null이 아닌" 상태는 재연결 코드를 모두 무력화시킨다.

### 52. 유저 필터 + Firestore 페이지네이션: 한 페이지에 필터 결과가 없어도 계속 fetch해야 한다
- **증상**: 특정 유저 필터 적용 시 2~3개 기록만 보이고 더 이상 로드 안 됨.
- **근본 원인**: `loadMoreGalleryItems()`에서 Firestore 페이지 fetch 후 필터된 결과가 여전히 없으면 "데이터 없음"으로 판단해 sentinel 숨기고 observer 종료.
  - Firestore는 전체 사용자 기록을 날짜 순으로 반환 → 특정 유저 기록이 드문 경우 한 페이지(30개)에 0개가 될 수 있음.
- **해결**: fetch 후에도 `galleryDisplayCount >= sortedFilteredCache.length`이고 `galleryHasMore`이면 다음 페이지 계속 fetch (재귀).
- **교훈**: 클라이언트 필터 + 서버 페이지네이션 혼합 시, 한 서버 페이지가 필터 결과 0건을 반환할 수 있음. "0건 = 끝"으로 처리하면 안 되고 `hasMore` 플래그를 항상 기준으로 삼아야 함.

### 53. 커서 상태(galleryLastDoc, galleryHasMore)는 캐시 초기화 시 함께 리셋해야 한다
- **근본 원인**: `cachedGalleryLogs = []` 하는 곳(로그아웃, 저장 후, 친구 변경 등)에서 커서 변수를 리셋 안 하면 다음 fetch가 잘못된 위치에서 시작.
- **교훈**: 커서 기반 페이지네이션 상태는 반드시 캐시 초기화와 묶어서 리셋할 것. `cachedGalleryLogs = []; galleryLastDoc = null; galleryHasMore = false;`를 항상 세트로.

---

## 2026-03-27 (admin.html 리뉴얼 + 이메일 발송 세션)

### 54. Cloud Function 대량 이메일 발송 — for 루프는 Deadline Exceeded를 유발한다
- **증상**: 회원 30명 이상에게 이메일 발송 시 `DEADLINE_EXCEEDED` 에러 발생. 실제로는 이메일이 모두 발송됐지만 클라이언트에는 에러로 반환됨.
- **근본 원인**: `for...of` 루프로 1건씩 순차 발송 → 1건당 약 2초 × 30명 = 60초+. 기본 타임아웃 120초를 쉽게 초과.
- **해결**: `Promise.allSettled(targets.map(async (t) => { ... }))` 으로 전체 병렬 발송. 소요 시간 2~3초로 단축. `timeoutSeconds: 300` 으로 안전망 추가.
- **교훈**: CF에서 다수 대상에게 외부 API(이메일, 푸시 등) 호출 시 반드시 병렬(`Promise.allSettled`)로 처리할 것. 실패한 건은 개별 추적하고 전체를 막지 않도록.

### 55. 이메일 발송 이력은 발송과 동시에 Firestore에 기록해야 한다
- **증상**: 이메일 발송 후 admin.html에서 "며칠 전 발송했는지" 알 수 없음. 기능 추가 전 발송분은 소급 불가.
- **교훈**: 발송 이력 추적이 필요한 기능은 처음부터 Firestore 기록 포함해서 구현할 것. 나중에 추가하면 과거 데이터 없음.
  - 패턴: 발송 성공 시 `db.collection('emailLogs').doc(uid).set({ lastSentAt, sentCount: increment(1) }, { merge: true })`

### 56. Firebase Secrets는 채팅/코드에 절대 노출하면 안 된다
- **증상**: 사용자가 Gmail 앱 비밀번호를 채팅창에 입력하려 했음.
- **교훈**: API 키, 비밀번호, Secrets는 반드시 터미널에서 `firebase functions:secrets:set SECRET_NAME` 으로 입력. 채팅, 코드, git에 절대 노출 금지.

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
- [ ] 새 Storage 경로 추가 시 `storage.rules`에 규칙을 추가했는가?
- [ ] 새 Firestore 필드 추가 시 `firestore.rules`의 화이트리스트에 추가했는가?
- [ ] Firebase SDK import 버전이 프로젝트 전체와 동일한가? (현재 10.8.0)
- [ ] Gemini 모델이 `gemini-2.5-flash`인가? (gemini-2.0-flash 사용 금지)
- [ ] **git commit + push 후 사용자 확인을 받았는가?** (확인 전 firebase deploy 금지)
## 2026-04-03 (로컬 에뮬레이터 재시작/부분 장애 판별)

### 59. 로컬 인프라 helper script는 "무언가 포트가 떠 있음"과 "서비스가 정상 구동 중"을 같은 뜻으로 취급하면 안 된다
- **증상**: Firestore 일부 포트만 살아 있고 Hosting/UI가 죽은 상태인데 `start-firebase-emulators.ps1`가 "already running"으로 안내해 브라우저에서는 `ERR_CONNECTION_REFUSED`가 났다.
- **근본 원인**: helper script가 에뮬레이터 관련 포트 중 하나라도 LISTEN이면 정상 실행으로 간주했고, 핵심 포트 세트가 완전한지 확인하지 않았다.
- **교훈**: 로컬 인프라 시작 스크립트는 반드시 핵심 포트 집합의 완전성까지 검사해야 한다. 부분 장애 상태는 별도 에러로 취급하고, 자동 복구든 명시적 재시작 안내든 다음 행동을 정확히 제시해야 한다.
## 2026-04-03 (관리자 권한 판정 일치)

### 60. 관리자 화면의 프런트 권한 판정과 Firestore / Cloud Functions의 서버 권한 판정은 반드시 같은 기준이어야 한다
- **증상**: 관리자 이메일은 프런트에서 통과했지만 `users` 컬렉션 list 쿼리와 관리자 callable이 모두 `permission-denied`로 막혀 대시보드가 비어 있었다.
- **근본 원인**: `admin.html`은 이메일 화이트리스트만으로 관리자 진입을 허용했고, Firestore 규칙과 서버 함수는 `admins/{uid}` 문서 존재만 관리자 기준으로 봤다.
- **교훈**: 관리자 같은 고권한 화면은 "UI 우회 허용 + 서버는 다른 기준" 구조를 만들면 바로 깨진다. 프런트가 먼저 서버 기준 권한을 보장하거나, 최소한 같은 단일 진실 원천으로 판정을 통일해야 한다.
## 2026-04-03 (Firebase Admin SDK timestamp 사용)

### 61. Firebase Admin SDK에서 클라이언트/예전 네임스페이스 방식의 `admin.firestore.FieldValue`를 당연하게 쓰면 런타임에서 바로 터질 수 있다
- **증상**: `ensureAdminAccess` callable이 `500 INTERNAL`로 실패했고, 브라우저에서는 관리자 권한 없음처럼 보였다.
- **근본 원인**: `admin.firestore.FieldValue.serverTimestamp()`를 사용했는데, 현재 실행 환경에서는 그 경로가 `undefined`였다.
- **교훈**: Admin SDK 값을 새로 쓸 때는 로컬 함수 런타임에서 실제로 한 번 호출해 보며 검증해야 한다. 단순 import 성공이나 정적 읽기만으로는 충분하지 않다. 메타 기록용 시각은 필요 이상으로 `FieldValue`에 의존하지 말고 `Date` 또는 검증된 서버 SDK 경로를 사용한다.
### 62. 사용자가 이미 명시적으로 배포 권한을 줬다면 같은 범위의 staging 배포는 다시 확인 절차를 반복하지 않는다
- **증상**: `main` 푸시 뒤 staging 배포 직전, 사용자가 이미 “staging은 확인 없이 진행해도 된다”고 말했는데도 추가 확인을 다시 요청할 수 있다.
- **근본 원인**: 저장소 규칙의 “배포 전 확인”을 기계적으로 적용하면서, 같은 대화 안에서 사용자가 준 명시적 예외 허용을 현재 작업 범위에 반영하지 못했다.
- **교훈**: 기본 규칙은 지키되, 사용자가 현재 범위에 대해 더 구체적인 예외 권한을 주면 그 권한이 우선한다. 특히 `staging` 같은 비본서버 배포는 사용자의 최신 명시 허가를 그대로 실행으로 연결해야 한다.

## 2026-04-04 (공유 기본 후속 조정)
### 61. 기본 공유 정책은 그대로 두고도 첫 화면 노출 밀도는 더 줄일 수 있어야 한다
- **교훈**: 공개 정책을 바꾼 뒤에는 `무엇을 기본으로 보여줄지`를 따로 한 번 더 다듬어야 한다. 공개 여부와 정보 밀도는 같은 문제가 아니므로, 기본 공유라도 첫 줄에서 부담되는 요소는 줄이고 가리기 옵션은 더 빠르게 이해되게 만든다.
- 2026-04-04: 모바일 안내 박스에 버튼을 같은 외곽선 안에 억지로 넣지 말 것. 안내와 액션 버튼은 분리하고, 접힘 패널은 트리거 바로 아래에 붙여서 넘침과 스캔 혼란을 줄인다.

## 2026-04-04 (대시보드 CTA 압축)

### 60. 같은 목적의 CTA는 한 화면에 한 번만 둔다
- 증상: `내 기록` 화면에서 친구 초대, 대화 참여, 공유 설정 같은 버튼이 여러 박스에 반복돼 사용자가 무엇을 먼저 해야 할지 판단하기 어려웠다.
- 교훈: 대시보드 개편 시에는 `한 섹션당 한 목적`, `같은 목적 CTA는 한 번만` 원칙을 지킨다. 갤러리 전용 설정은 갤러리에 남기고, 대시보드는 오늘 해야 할 행동과 현재 진행 중인 미션만 먼저 보여준다.

## 2026-04-04 (주간 미션 재설정 즉시 반영)

### 60. 재설정/리셋 액션은 서버 저장만 하지 말고 화면 캐시까지 같은 턴에 비워야 한다
- **증상**: `이번 주 미션 다시 정하기` 확인 후 `미션이 초기화되었습니다` 토스트가 떠도 대시보드가 이전 진행 상태를 다시 그려서 재설정 확인창이 연속으로 떴다.
- **근본 원인**: `resetWeeklyMissions()`가 Firestore에는 `weeklyMissionData: null`을 저장했지만, `renderDashboard()`가 직후 메모리 캐시와 localStorage 캐시의 이전 `weeklyMissionData`를 다시 사용했다.
- **교훈**: 대시보드처럼 캐시를 쓰는 화면에서 리셋/재설정 액션을 만들면 서버 write 뒤에 끝내지 말고, 같은 함수에서 로컬 캐시와 화면 기준 데이터도 즉시 같은 상태로 패치한 뒤 fresh fetch를 백그라운드로 태워야 한다.
