# 2026-04-20 Diet Program Copy Trim

## Plan
- [x] Shorten the diet-program summary copy for mobile readability
- [x] Keep only the core meaning for guide/reminder and free-record messaging
- [x] Run project verification and record the result

## Notes
- User asked to reduce the length of the diet-method helper copy so it reads cleanly on mobile.

## Review
- Implemented:
  - Shortened the selected-method summary copy to `오늘 식사 가이드와 알림이 바뀌어요.`
  - Shortened the free-record support copy to `운동·명상·수면 기록은 그대로예요.`
  - Tightened the pre-selection dashboard copy to `식사 가이드가 바뀌어요.` / `프로필에서 골라보세요.`
- Verification:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
