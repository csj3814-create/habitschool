# 2026-04-27 Reward Market Point Charge Policy

## Goal
- Keep mock reward-market tests from consuming member points or exchange limits on staging.
- Ensure live point settlement only remains deducted when coupon issuance actually succeeds.

## Plan
- [x] Inspect the current point-settlement flow for mock/live issuance and identify where points and limit usage are recorded.
- [x] Change mock redemption to skip point deduction, and refund precharged live points when issuance falls into manual review.
- [x] Limit issuance-usage counting to live charged redemptions, then verify with tests and frontend bundles.

## Review
- Added `shouldChargePointsImmediately(...)` so point precharge now happens only in `live` mode.
- Added `refundChargedRewardPoints(...)` so a live point precharge is automatically restored if issuance falls into `failed_manual_review` or missing coupon payload.
- Updated issuance usage aggregation so mock issues and refunded/manual-review cases no longer consume daily/weekly/monthly exchange quotas.
- Added unit tests for the new charge/usage policy.
- Verification:
  - `node -c functions/reward-market.js`
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
