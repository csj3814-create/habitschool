# 2026-04-14 Simple Profile Entry And Guidance

## Plan
- [x] Review relevant simple-mode and install CTA context
- [x] Inspect simple-mode default tab routing and profile top layout
- [x] Change simple-mode default entry to profile
- [x] Add profile-top guidance pointing users to 식단, 운동, 마음 tabs
- [x] Verify bundles/tests and document results

## Notes
- Request: in simple mode, land on the profile tab first instead of diet.
- Add guidance at the very top of the profile screen: `식단, 운동, 마음을 눌러 습관을 기록하세요`.
- Include arrows visually pointing toward the top tab row.

## Review
- Changed:
  - Simple mode now treats `profile` as the default entry tab instead of `diet`.
  - The simple-mode skip link now targets the profile section so keyboard/assistive entry lands on the first visible screen.
  - Added a profile-top guidance panel with upward arrows and `식단, 운동, 마음을 눌러 습관을 기록하세요` copy.
- Verification:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
  - `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-main-check.js`
