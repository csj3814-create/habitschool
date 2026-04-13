# 2026-04-13 Dashboard Haebit Header Refine

## Plan
- [x] Rework the top dashboard hero so the persistent row carries the real headline and daily score
- [x] Remove the duplicated lower score card/body copy from the hero
- [x] Rename routine/week labels to `오늘 해빛` and `이번 주 해빛`
- [x] Verify the dashboard bundles still build cleanly

## Notes
- The user wanted the hero to stay informative even when collapsed.
- `40/65` should live in the top-right badge where the old completion pill was.
- Once the user reaches the 65-point threshold, that badge should switch to `오늘 완료` and turn green.
- The lower helper copy (`오늘 완료 · 이번 주 14%`) and the separate `오늘 포인트` card were redundant and removed.

## Review
- Moved the hero to a simpler `headline + score badge + toggle` structure.
- Kept the three action rows as the expandable body content.
- Renamed the weekly card headline from `이번 주 흐름` to `이번 주 해빛`.
- Verification:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
  - `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`
