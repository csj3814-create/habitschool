# 2026-06-25 Challenge start on-chain deposit toast

## Checklist

- [x] Reproduce or trace the challenge start path that shows `온체인 예치 트랜잭션이 필요합니다.`.
- [x] Identify whether the blocker is client payload, local recovery state, callable validation, or live deployment mismatch.
- [x] Fix the narrow root cause without weakening on-chain stake safety or duplicate-deposit protection.
- [x] Add/adjust regression tests for the recovered challenge-start path.
- [x] Verify with required project checks:
  - [x] `npm test`
  - [x] `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
  - [x] `node --check functions/runtime.js`
- [x] Document review result and deployment notes.

## Notes

- User-visible symptom: challenge start toast says `온체인 예치 트랜잭션이 필요합니다.` and challenge does not start.
- Screenshot context: user appears to be trying to start a 7-day weekly challenge while a 30-day master challenge is already active.
- Relevant lessons reviewed: tier-keyed challenge stake isolation, two-phase on-chain start recovery, and not failing a successful start because post-start refresh fails.

## Review

- Root cause: `startChallenge` only recognized the server-side tiered staking flow when the request included `stakeFlowVersion >= 2`. If a stale client or old pending recovery payload sent an approval-only request without that field, the callable treated it as the legacy direct-stake flow and threw `온체인 예치 트랜잭션이 필요합니다.`
- Fix:
  - `functions/runtime.js` now infers a tiered stake request when there is a positive stake amount, no legacy `stakeTxHash`, and an approval/wallet hint (`stakeApprovalTxHash` or `stakeWalletAddress`), even if `stakeFlowVersion` is missing.
  - `js/blockchain-manager.js` now upgrades old local pending approval-only recovery records to `stakeFlowVersion: 2`.
  - PWA/cache version bumped `213 -> 214` so mobile browsers fetch the corrected challenge client code.
- Duplicate-deposit safety:
  - The backend still checks the requested tier slot with `getChallenge(userWalletAddress, tierIndex)` before sending a new on-chain start.
  - If the same challenge/amount/duration is already on-chain for that tier, it returns recovered instead of staking again.
  - If a different challenge is active in the same tier, it still fails.
- Verification:
  - `npm test` passed: 51 files / 358 tests.
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js` passed.
  - `node --check functions/runtime.js` passed.
  - `node scripts\generate-en-entry.js --check` passed.
  - `git diff --check` passed.
  - Search found no stale `?v=213`, `habitschool-v213`, or `gemini-2.0-flash`.
  - Browser sanity check on `http://127.0.0.1:5000/?qa=challenge-start-fix`: app loaded with `js/app.js?v=214` and `styles.css?v=214`, no warning/error logs, and signed-out guest-gallery interaction worked.
- Remaining deployment note: the real challenge start flow requires authenticated wallet signing and live Functions, so production confirmation must happen after commit/push and Firebase deploy.
