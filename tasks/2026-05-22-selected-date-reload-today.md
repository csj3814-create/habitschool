# 2026-05-22 리로드 시 선택 날짜 오늘 보정

## Summary
해빗스쿨 페이지를 오래 열어 둔 뒤 새로고침하거나 브라우저가 페이지를 복원할 때, 날짜 입력값이 이전 날짜로 되살아나는 경우를 막는다. 리로드/BFCache 복원 직후 KST 오늘 날짜를 다시 확인하고, 오늘이 아니면 오늘로 바꾼 뒤 로그인 상태에서는 오늘 기록을 다시 로드한다.

## Checklist
- [x] `tasks/lessons.md` 관련 패턴 검토
- [x] 선택 날짜 초기화/복원 흐름 확인
- [x] 리로드/BFCache 복원 시 날짜 보정 구현
- [x] PWA 캐시 버전 갱신
- [x] 회귀 테스트 추가
- [x] changelog 작성
- [x] 검증 실행
- [x] 결과 기록

## Changes
- `syncSelectedRecordDateToToday()`를 추가해 `selected-date`의 `value`, `defaultValue`, `min`, `max`를 KST 오늘 기준으로 동기화한다.
- `installRecordDateReloadGuard()`를 추가해 `DOMContentLoaded`와 `pageshow` 이후 reload/BFCache 복원 상황에서 오늘 날짜를 재확인한다.
- 날짜가 바뀌고 사용자가 로그인되어 있으면 `loadDataForSelectedDate(todayStr)`로 오늘 기록을 다시 로드한다.
- PWA 캐시 버전을 `v194`/`habitschool-v194`로 갱신했다.
- `changelog.html`에 `v1.0.13` 사용자용 변경 내역을 추가했다.

## Verification
- `npx vitest run tests/selected-date-reload.test.js tests/pwa-versioning.test.js tests/index-html-integrity.test.js` 통과 (3 files, 3 tests).
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js` 통과.
- `git diff --check` 통과.
- `npm test` 통과 (42 files, 297 tests).

## Deployment
- Staging deploy complete: `npm run deploy:staging`.
- Verified `https://habitschool-staging.web.app` serves `js/app.js?v=194`, `styles.css?v=194`, and `habitschool-v194`.
- Verified `https://habitschool-staging.web.app/changelog.html` contains `v1.0.13` and `2026년 5월 22일`.
