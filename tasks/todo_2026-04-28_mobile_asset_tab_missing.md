# 2026-04-28 Mobile Asset Tab Missing Data

## Goal
- Make the mobile asset tab show wallet, recent HBT chart, and transaction history without waiting indefinitely on one slow dependency.
- Keep last known asset data visible when Firestore or wallet restore is delayed.
- Add regression coverage for mobile asset fallback behavior.

## Checklist
- [x] Review relevant loading/fallback lessons.
- [x] Trace asset tab chart, wallet, and transaction-history render paths.
- [x] Patch independent cache-first/fallback handling.
- [x] Add regression coverage.
- [x] Run verification.

## Review
- User reports PC asset tab works, but mobile shows blank recent 7-day HBT, wallet disconnected, and transaction history stuck loading.
- Root cause: mobile asset rendering had cache-first handling for point/HBT totals, but wallet address, mini chart, and transaction history were still allowed to wait on slower wallet/Firestore follow-up work.
- Root cause: timed-out history snapshots could overwrite the previous history state with `isLoading=true`, leaving the transaction panel stuck on the loading message.
- Added wallet-address cache hydration, mini-chart cache/default rendering, and history timeout behavior that keeps cached records instead of replacing them with an indefinite loading state.
- Verified with `npm test`, `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js`, and `git diff --check`.
