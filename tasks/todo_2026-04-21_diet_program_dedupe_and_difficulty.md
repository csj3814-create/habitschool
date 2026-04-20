# 2026-04-21 Diet Program Dedupe And Difficulty

## Plan
- [x] Remove repeated method names from diet-program summary lines
- [x] Show difficulty again in the compact dashboard summary
- [x] Keep the method guidance copy short across affected surfaces
- [x] Run verification and record the result

## Notes
- User asked to remove duplicate diet method names like `스위치온 다이어트 · 초기 저탄수, 이후 균형`.
- User also wants difficulty visible again.

## Review
- Implemented:
  - Removed the extra method name from diet-program status lines so the dashboard chip carries the label once and the summary line stays focused on the meal cue.
  - Put difficulty back into the compact dashboard chip as `식단명 · 난이도`.
  - Shortened the analysis-tip prefix to `식단 팁` so the method name does not repeat there either.
- Verification:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
