# 2026-04-13 Dashboard Routine Score UI

## Plan
- [x] 오늘의 루틴 카드 구조와 점수 데이터 사용 지점 확인
- [x] 식단/운동/마음 카드에 획득 점수/최대 점수 표시 추가
- [x] `다음 보상` 카드를 `오늘 포인트` / `획득점수/80`으로 변경
- [x] 테스트와 번들 검증 실행

## Notes
- 상단 `오늘의 루틴` 카드는 `todayAwarded.dietPoints`, `exercisePoints`, `mindPoints`를 이미 받고 있다.
- 각 카테고리 최대 점수는 `식단 30`, `운동 30`, `마음 20`이다.
- 일일 총점 최대는 `80`이다.

## Review
- 상단 `오늘의 루틴` 카드 3개 액션 칩에 `획득 점수/최대 점수` 배지를 추가했다.
- 상단 요약 카드의 `다음 보상`을 `오늘 포인트`로 바꾸고 `0/80` 형식으로 렌더링되게 했다.
- 진행 중인 카테고리는 `완료` 대신 `진행 중` 상태와 `현재 점수/최대 점수` 안내가 보이게 조정했다.
- `오늘 포인트` 카드에 작은 진행 바와 카테고리별 점수 요약 문구를 추가했다.
- 3열 좁은 칩 대신 모바일에서 읽기 쉬운 가로형 액션 행 구조로 다시 정리했다.
- 검증:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
  - `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-main-check.js`

## Final Pass
- Moved the daily score summary (`0/80` + progress bar) into the headline row on the right.
- Removed the lower four stat boxes to keep the routine panel focused on next action and daily progress.
- Removed the separate `오늘의 인증 현황` card because it duplicated the new routine hero status.
