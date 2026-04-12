# 2026-04-12 Asset Balance Loading Stability

## Goal

- Prevent the wallet asset card from intermittently showing missing point or HBT values that only recover after multiple manual refreshes.

## Plan

- [x] Review recent lessons and the current asset loading flow for points and onchain HBT
- [x] Identify the read paths that can transiently fail and design a graceful fallback/retry path
- [x] Implement the fix with minimal UI impact
- [x] Verify with tests and bundle checks

## Review

- Root cause:
  - `updateAssetDisplay()` raced the user doc against a 3-second fake timeout snapshot, so transient Firestore slowness could make the wallet behave as if the user doc did not exist.
  - The wallet UI only cached points, proactively replaced HBT with `조회 중...`, and stopped after a single failed onchain read.
  - When the blockchain module finished loading later, it skipped the recovery fetch if the HBT text already contained `HBT`, which made stale/partial UI harder to recover from.
- Fix:
  - Added shared wallet-display helpers that cache both points and HBT in localStorage and reapply the last known good values before live reads finish.
  - Added short background retries for transient user-doc and onchain balance failures instead of blanking the card and depending on repeated manual refreshes.
  - Made the asset tab always perform one more onchain HBT refresh after the blockchain module finishes loading, and added a short retry inside `fetchOnchainBalance()`.
  - Bumped the frontend/service-worker asset version to `129` so the new loading behavior is not hidden behind stale PWA cache.
- Verification passed:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
  - `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`
