# 2026-04-14 Point to HBT Mint Failure

## Goal
- Reproduce the point -> HBT conversion failure on prod.
- Isolate whether the 500 comes from client payload, Firebase callable/auth, or onchain mint execution.
- Fix the root cause, verify locally, then prepare staging/prod deployment notes.

## Plan
- [x] Review lessons and trace current mint flow in app/functions.
- [x] Pull production function logs for the failing `mintHBT` call.
- [x] Implement root-cause fix with the smallest safe change.
- [x] Verify with tests/builds and targeted runtime checks.
- [x] Report outcome and, if needed, deploy in the usual order.

## Review
- Root cause: the contract resets the per-wallet mint cap on UTC day boundaries, which maps to 9:00 AM KST, but the app and callable pre-check were summing `blockchain_transactions.date` by KST calendar date.
- Fix: align the callable pre-check with the onchain reset window using recent transaction timestamps, show `매일 오전 9시 reset` next to the limit UI, and surface a clearer daily-limit toast for `ExceedsUserDailyCap`.
- Verification:
  - `npm test` -> 158 passed
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js` -> passed
  - `node --check functions/index.js` -> passed
