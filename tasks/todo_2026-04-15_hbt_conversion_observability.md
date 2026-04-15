# 2026-04-15 HBT Conversion Observability

## Goal
- Make point-to-HBT conversion outcomes explicit across mobile and desktop.
- Log server-side success/failure details so production investigations do not rely on inference.
- Confirm successful conversions on the client even when the immediate callable response or Firestore realtime channel is shaky.

## Plan
- [x] Review the current `mintHBT` callable and client conversion flow for the narrowest safe change.
- [x] Add explicit `mintHBT` success logging and richer failure logging, including smart-contract revert metadata when available.
- [x] Add a post-conversion confirmation path on the client that rechecks recent successful conversion docs before deciding the final user-facing state.
- [x] Verify with tests/builds and document the outcome.

## Review
- Server `mintHBT` now accepts/stores an `attemptId`, logs explicit success payloads, and logs decoded custom-error metadata when onchain minting fails.
- The client now sends `attemptId` with each conversion request and, if the callable response is incomplete or transiently fails, polls recent successful `blockchain_transactions` docs to reconcile the outcome before showing a final failure toast.
- PWA asset versions were bumped to `v157` so a later staging/production deploy will fetch the updated blockchain manager instead of stale cached code.
- Verification:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
  - `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`
  - `npx esbuild js/blockchain-manager.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-blockchain-check.js`
  - `node --check functions/index.js`
