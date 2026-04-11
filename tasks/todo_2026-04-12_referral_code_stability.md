# 2026-04-12 Referral Code Stability

## Goal

- Ensure invite/referral codes do not change unexpectedly once a user already has one.
- Move referral code issuance to a single server-side path and remove client-side random overwrite paths.
- Preserve existing codes like `5SDUKF` as-is unless a user truly has no code yet.

## Plan

- [x] Trace all `referralCode` generation and write paths
- [x] Add a server-side `ensureReferralCode` callable that only issues a code when missing
- [x] Remove client-side random referral code writes from wallet initialization / reconnect flows
- [x] Prevent direct client updates to `referralCode`
- [x] Verify with tests and bundle checks
- [x] Document review notes and deployment sequence

## Review

- Added a single server-side `ensureReferralCode` callable and referral-code reservation path in `functions/index.js`.
- Switched auth and wallet initialization flows to request a stable server-issued code instead of minting one in the browser.
- Removed `referralCode` from client-write Firestore rules so legacy browser paths cannot silently overwrite invite codes.
- Bumped app/service-worker cache versions to `126` so stale clients stop pulling the old referral-code behavior.
- Verification passed:
  - `node -c functions/index.js`
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
  - `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`
- Deployment note: because this change touches `firestore.rules`, staging/prod release must include `firestore:rules` alongside `hosting,functions`.
