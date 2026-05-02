# 2026-05-01 Friend challenge readiness

## Goal
- 친구 챌린지 박스가 모든 친구에게 `5일 필요`처럼 보이는 원인을 찾는다.
- 준비도 계산이 이번 달 기록만 보지 않고 실제 챌린지 기준 기간 또는 누적 기록을 반영하게 고친다.
- 같은 월 경계 오류가 다시 생기지 않도록 검증과 교훈을 남긴다.

## Checklist
- [x] 친구 챌린지 렌더링과 준비도 계산 로직 위치 확인
- [x] 기록 조회 기간이 월초로 잘리는지 확인
- [x] 준비도 계산 기준 수정
- [x] 테스트와 번들 검증 실행
- [x] `tasks/lessons.md`에 재발 방지 교훈 추가

## Notes
- 2026-05-01 기준 월초라서 5월 기록만 세면 4월 말의 실제 기록/연속 기록이 빠질 수 있다.
- 기존 화면은 친구별 `daily_logs` 쿼리를 한 묶음으로 기다리다가 timeout이 나면 전체 친구를 `5일 부족` fallback으로 캐시할 수 있었다.
- 수정 후에는 최근 30일 날짜 목록을 직접 만들고 `uid_YYYY-MM-DD` 문서 ID로 조회해 월 경계를 넘는 기록을 포함한다. 조회가 지연된 친구는 `5일 부족`으로 확정하지 않고 `확인 중`으로 표시한다.
- 검증 통과: `npm test`, `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js`, `git diff --check`.
