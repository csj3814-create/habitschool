# 2026-04-27 점진 로딩 병목 수정
> **상태**: 진행 중

## 작업
- [x] `tasks/lessons.md`에서 관련 패턴 검토
- [x] 초기/탭 로딩 경로에서 직렬 대기와 stale in-flight 상태 추적
- [x] 식단/운동/마음/내 기록 핵심 데이터는 먼저 표시되도록 로더 분리
- [x] 친구/갤러리/자산/블록체인 같은 부가 데이터는 timeout 후 후속 렌더로 격리
- [x] 회귀 테스트와 번들 검증 실행
- [x] 결과와 남은 리스크 정리

## 가설
- 친구 정보나 갤러리 enrich가 첫 렌더에 섞이면 기록/갤러리 화면이 빈 상태로 오래 머물 수 있다.
- 자산 탭의 블록체인 초기화가 탭 전환이나 대시보드 갱신과 같은 사용자 흐름에 직렬로 묶이면 전체 체감 로딩을 늦출 수 있다.
- 오래 걸리는 in-flight promise가 stale reset 없이 재사용되면 새로고침 후에도 한동안 데이터가 안 보일 수 있다.

## 검증 예정
- `npm test`
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`

## 결과
- 친구 정보 로더에 user-cache/live-query/pending-load timeout, empty-cache TTL, stale in-flight identity guard를 추가했다.
- 친구 정보가 늦거나 실패해도 갤러리/대시보드/프로필 기본 UI가 먼저 표시되고, 짧은 백그라운드 재시도로 후속 렌더가 다시 일어나도록 했다.
- 로그인 직후 숨은 갤러리/자산 prefetch를 중단하고, 현재 보이는 탭일 때만 늦게 갱신하도록 조정했다.
- 자산 탭의 Firestore 히스토리, 온체인 잔액, 토큰 통계, 보상몰 snapshot에 timeout을 추가해 부가 정보가 전체 로딩을 붙잡지 않게 했다.
- 대시보드 Cloud Function fallback Firestore 조회에도 timeout을 추가했다.

## 검증
- `npm test` 통과 (`244 passed`)
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js` 통과
- `git diff --check` 통과
