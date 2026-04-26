# 2026-04-27 Reward Market Mobile Cleanup

## Goal
- Make the reward-market header and recipient-phone area feel lighter and cleaner on mobile.
- Keep only the minimum explanatory copy and move refresh into the market header.

## Plan
- [x] Inspect the current reward-market header, meta chips, and recipient-phone layout.
- [x] Reduce the copy to one-line utility text, trim the meta chips, and keep refresh compact in the header.
- [x] Compress the phone input into a single-row mobile form and verify the frontend build/tests.

## Review
- Trimmed the reward-market header copy to a single line and replaced the oversized top-right action with a compact inline refresh button.
- Reduced the reward-market meta chips to only the remaining exchange chip plus a provider-warning chip when needed.
- Shortened the recipient-phone helper copy and kept the phone input plus save button on one row for mobile instead of stacking them.
- Removed the extra muted helper line under the save button and kept the lower status line only for validation or saved-number feedback.
- Verification:
  - `npm test`
  - `npx esbuild js/reward-market.js --bundle --format=esm --platform=browser --outfile=%TEMP%\reward-market-check.js`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
  - `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-main-check.js`
  - `Select-String -Path index.html -Pattern '포인트로 교환하고 앱 보관함에서 바로 확인해요.|실발급 전환 때 바로 쓸 번호예요.|새로고침'`
