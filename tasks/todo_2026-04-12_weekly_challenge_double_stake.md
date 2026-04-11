# 2026-04-12 Weekly Challenge Double Stake Investigation

## Goal

- Determine why a `5000 HBT` weekly challenge start resulted in a `10000 HBT` wallet balance drop.
- Verify whether the mismatch is caused by duplicate onchain staking, backend record drift, or a client-side display bug.
- Apply a safe fix and document the remediation path before more users can hit the same issue.

## Plan

- [x] Review relevant lessons and the latest challenge / wallet fixes from today
- [x] Verify the affected wallet's live onchain HBT balance and staking balance
- [x] Verify the corresponding Firestore challenge record and transaction history
- [x] Trace the exact challenge-start flow that can create an orphan or duplicate stake
- [x] Implement the narrowest safe fix
- [x] Run verification (`npm test`, app bundle check) and document the result

## Review

- Live mainnet check confirmed `0xa3f5961306b19BC45cd80407D0A932FcA8Ef81d2` had `8084 HBT` liquid and `10000 HBT` staked onchain, which matches the wallet drop the user saw.
- The weekly card still showed `5000 HBT`, so the issue was not a display-only bug. It was an onchain/backend drift case.
- Root cause: challenge start stakes onchain first, then calls the `startChallenge` callable to write Firestore state. While `startChallenge` was returning 500s (`appliedChallengeBonusPolicy is not defined`), retrying the same weekly challenge could submit a second `5000 HBT` stake even though only one weekly record was eventually stored.
- Prevention fix in the client: after a successful stake tx, the app now stores a pending challenge-start record locally and reuses that tx hash on retry instead of sending a second stake. The app also compares onchain aggregate challenge stake vs recorded active challenge stake and blocks new staking if unreconciled stake already exists.
- Prevention fix in the callable: `startChallenge` now treats a retry with the same `stakeTxHash`, same tier, and same amount as an idempotent recovery and returns success instead of rejecting it as a duplicate active challenge.
- Verification: `npm test`, `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`, `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`, and `node -c functions/index.js` all passed.
- Manual remediation was completed for the affected weekly stake:
  - Onchain `resolveChallenge(user, true)` returned the full `10000 HBT` from staking custody to `0xa3f5961306b19BC45cd80407D0A932FcA8Ef81d2`.
  - Mainnet tx: `0x784530e234dbd338eddfa2cf49a7a85b1d30e3d2c5bb6a2378f2250126f436e9`
  - Post-remediation verification showed `18084 HBT` liquid and `0 HBT` staked onchain.
  - Firestore `users/KwrwGEa2qoOljcAQkrpuk9MRS6G3.activeChallenges.weekly` was removed, leaving only the ongoing `mini` challenge.
- The affected user can now restart the weekly challenge with `5000 HBT`, but the retry-safety fix should be pushed and deployed first so the same drift cannot recur during a future backend error.
