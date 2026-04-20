# 2026-04-20 Diet Program Selection Flow And Copy Trim

## Plan
- [x] Review the profile diet-method selection flow and compact copy sources
- [x] Return to the dashboard after selecting a diet method from profile
- [x] Shorten method cards, dashboard guidance, and reminder labels for mobile
- [x] Run verification and record the result

## Notes
- User wants the profile method picker to close back to the dashboard after a selection.
- User also wants shorter mobile copy across all diet-method surfaces.

## Review
- Implemented:
  - `프로필에서 바꾸기`로 들어간 선택 흐름은 저장 후 `dashboard` 탭으로 돌아가도록 정리했다.
  - 식단 방법 카드의 안내 문구, 기록 가이드 상태 문구, 보조 문구, 알림 배지를 전반적으로 짧게 줄였다.
  - `현미밥 초록채소 식단`에서는 단백질 강조 문구를 빼고 `현미밥 적게, 초록채소 듬뿍` 기준으로 맞췄다.
  - 대시보드 보조 문구는 두 줄 설명을 합치지 않고 한 줄만 보여주도록 줄였다.
- Verification:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
