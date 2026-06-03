# 2026-06-03 Habit Group Full Membership UI

## 목표
- 사용자가 이미 2개 소모임에 참여 중이면 추천 소모임을 기본으로 숨긴다.
- 펼치기 액션을 눌렀을 때만 다른 소모임을 볼 수 있게 한다.
- `2개 참여 중` 문구를 `최대 2모임`으로 바꾸고 중복 노출을 줄인다.

## 체크리스트
- [x] 기존 소모임 렌더링 위치 확인
- [x] 대시보드 추천 목록 접기 UI 반영
- [x] 문구/중복 정리 및 테스트 반영
- [x] 검증 실행

## 반영
- 가입한 소모임이 2개면 대시보드의 다른 추천 소모임은 기본으로 숨긴다.
- `다른 소모임 보기 · 최대 2모임` 버튼을 누르면 다른 소모임 목록을 펼쳐 볼 수 있다.
- 추천 카드마다 반복되던 `2개 참여 중` 문구를 제거하고, 모달의 가입 불가 버튼은 `최대 2모임`으로 바꿨다.
- 런타임 변경 반영을 위해 PWA 자산 버전을 `v203`으로 회전했다.

## 검증 예정
- [x] `npx vitest run tests/habit-groups-transition.test.js tests/habit-groups.test.js tests/pwa-versioning.test.js`
- [x] `npm test`
- [x] `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
- [x] `node --check functions/runtime.js`
- [x] `git diff --check`
- [x] `rg -n "v=202|habitschool-v202|2개 참여 중" index.html styles.css sw.js js tests`

## 리뷰
- 앱 소스에는 `2개 참여 중` 문구가 남지 않고, 회귀 테스트의 금지 기대값에만 남는다.
- 2개 참여 중인 사용자는 대시보드에서 추천 소모임을 기본으로 보지 않고, `다른 소모임 보기 · 최대 2모임`을 눌렀을 때만 펼쳐 본다.
- 가입 가능 상태에서는 기존처럼 추천 소모임과 참여 CTA를 바로 보여준다.
