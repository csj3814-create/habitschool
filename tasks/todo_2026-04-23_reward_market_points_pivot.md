# 2026-04-23 Reward Market Points Pivot

## Goal
- Move gifticon redemption to off-chain app points.
- Keep the existing HBT system alive in the app, but decouple it from reward-market redemption.

## Plan
- [x] Inspect the current reward-market backend, runtime callable, asset-tab UI, and tests for HBT-coupled redemption logic.
- [x] Refactor the backend redemption flow to charge points instead of requiring HBT burn transactions.
- [x] Update the reward-market UI and copy so the market uses points while the HBT conversion flow remains separate.
- [x] Verify with automated checks and record follow-up notes.

## Review
- Reward-market redemption now uses app points with deterministic `clientRequestId` idempotency instead of mandatory HBT burn input.
- HBT-specific market-pricing support remains in the codebase, but reward-market issuance policy defaults to the point-settlement path and only requires quote readiness for HBT settlement.
- Asset-tab UI copy, coupon vault labels, and live-mode validation now describe point redemption plus app-vault coupon delivery while keeping HBT as a separate asset flow.
- Admin reward-market summaries remain control-tower based and present the point-fixed policy.
- Verification:
  - `node -c functions/reward-market.js`
  - `node -c functions/runtime.js`
  - `npm test`
  - `npx esbuild js/reward-market.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\reward-market-check.js`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
  - `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`
