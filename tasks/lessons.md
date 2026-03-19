# 개발 교훈 (Lessons Learned)

## 2026-03-16

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
