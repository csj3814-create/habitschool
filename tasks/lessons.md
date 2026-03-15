# 개발 교훈 (Lessons Learned)

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
