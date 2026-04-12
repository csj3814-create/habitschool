# 2026-04-12 HBT History Latency Fix

## Goal

- Remove the long blank wait before HBT transaction history appears in the asset tab and make the history panel feel immediate.

## Plan

- [x] Inspect the HBT history loading path in the asset tab and server callable
- [x] Identify why the UI renders an empty state before the delayed data arrives
- [x] Implement a faster or cache-preserving history loading experience
- [x] Verify with tests and bundle checks

## Review

- Root cause: the asset tab waited for slow onchain HBT transfer history before rendering any wallet history, while the static HTML placeholder falsely implied there was no history.
- Fix: show cached history first when available, render app-authored history as soon as Firestore returns, keep the HBT panel in an "온체인 확인 중" state while slow chain data arrives, and only merge onchain rows afterward.
- Verification:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
  - `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-main-check.js`
- Pending: staging deploy after user confirmation.
