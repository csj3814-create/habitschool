# 2026-04-27 Reward Market Limit Fix

## Goal
- Fix the reward-market limit snapshot so `2000P` coupons are not blocked by a mistaken `500P` default limit.

## Plan
- [x] Inspect the reward-market config and staging behavior to find why the remaining limit is `500P`.
- [x] Separate the minimum redeem floor from the daily/weekly/monthly limit defaults and add a regression test.
- [x] Verify the updated server logic and capture the lesson from this correction.

## Review
- Root cause: the reward-market config was using the `500P` minimum redemption floor as the fallback for daily/weekly/monthly limits whenever env values were missing.
- Fix: restored launch-sized default limits (`2000 / 5000 / 10000`) and made the limit fallback use those defaults while still clamping each bucket to at least `minRedeemPoints`.
- Regression coverage: added a test that proves `minRedeemPoints=500` does not collapse the exchange limits to `500`.
- Verification:
  - `node -c functions/reward-market.js`
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
  - `node -` check for `buildRewardMarketConfig({ REWARD_MARKET_MIN_REDEEM_POINTS: '500' })` returning `daily=2000`, `weekly=5000`, `monthly=10000`
