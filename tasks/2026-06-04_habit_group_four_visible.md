# 2026-06-04 소모임 4개 노출 조정

## Plan
- [x] 현재 대시보드 소모임 추천/내 소모임 노출 제한 위치 확인
- [x] 가입 제한 2개는 유지하고 화면 노출 제한만 4개로 분리
- [x] 관련 정적 테스트 보강
- [ ] 표준 검증 실행

## Notes
- 사용자 요청: 소모임은 네 개까지 보이게 한다.
- 해석: 동시에 참여 가능한 최대 소모임 수는 기존 2개로 유지한다.
- 변경 방향: `HABIT_GROUP_DASHBOARD_VISIBLE_LIMIT = 4`를 추가해 추천/펼침/빈 상태/내 소모임 목록 표시 한도를 통일한다.

## Review
- 대시보드 소모임 노출 한도를 `HABIT_GROUP_DASHBOARD_VISIBLE_LIMIT = 4`로 분리했다.
- 가입 가능 최대치는 `MAX_HABIT_GROUP_MEMBERSHIPS = 2`로 유지했다.
- `v206` 잔여 캐시 버전 없음.
- Verification passed:
  - `npx vitest run tests/habit-groups-transition.test.js tests/habit-groups.test.js tests/pwa-versioning.test.js`
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js`
  - `node --check functions\runtime.js`
  - `git diff --check`
