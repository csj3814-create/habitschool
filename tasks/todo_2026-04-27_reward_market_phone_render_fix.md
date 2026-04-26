# 2026-04-27 Reward Market Phone Render Fix

## Goal
- Stop the reward-market cards from falling back to the pre-image layout when the user types or saves a recipient phone number.
- Reconfirm whether the recipient phone is truly required in the current Giftishow flow.

## Plan
- [x] Inspect the phone input/save handlers and compare them with the current reward-market snapshot renderer.
- [x] Route phone input/save updates through the current snapshot renderer so the image-backed card layout stays intact.
- [x] Verify tests and frontend bundles, then document the live-mode recipient-phone requirement clearly.

## Review
- The regression came from legacy handlers still calling `renderRewardRecipientPhonePanel()` and `renderRewardMarketCatalog()`, which rebuild the older no-image card layout.
- Updated both the draft-input handler and the saved-phone handler to call `renderRewardMarketSnapshot()` instead, so the current meta, phone panel, card layout, and status messaging stay in sync.
- Live-mode phone requirement is still intentional in the backend because the current Giftishow order template includes `phone_no` and the callable rejects live issuance without a normalized recipient phone.
- Added a small regression test that checks the phone input/save handlers stay wired to `renderRewardMarketSnapshot()`.
- Verification:
  - `npm test`
  - `npx esbuild js/reward-market.js --bundle --format=esm --platform=browser --outfile=%TEMP%\reward-market-check.js`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
  - `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-main-check.js`
