# 2026-04-12 Halving Schedule Alignment

## Goal

- Fix the `채굴 반감기 현황` box so `구간 / 전환 비율 / 채굴 풀` columns line up cleanly.
- Keep the change narrow to the schedule layout styling.

## Plan

- [x] Inspect current halving schedule markup and CSS grid
- [x] Align header and row columns with one shared grid template
- [x] Verify with tests and bundle checks

## Review

- The halving schedule header and rows now share one grid template so the three columns stay aligned.
- The `채굴 풀` column is right-aligned and uses tabular numerals so large values no longer look left-shifted.
- Verification passed:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
  - `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`
