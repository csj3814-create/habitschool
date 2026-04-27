# 2026-04-27 Weekly Challenge Daily Progress

## Goal
- Fix the asset-tab health habit challenge card when today's 65P+ daily mission should count immediately for the 7-day weekly challenge.
- Make the UI resilient when the stored active challenge document has not yet been reconciled with today's daily log.

## Checklist
- [x] Inspect asset-tab challenge progress rendering.
- [x] Inspect daily 65P qualification helper logic.
- [x] Patch the missing same-day reconciliation.
- [x] Add regression tests.
- [x] Run verification.

## Review
- User reported 70P earned today, but the 7-day weekly challenge still shows 0%.
- Root cause: the asset tab rendered stored `activeChallenges.completedDays` before reconciling the same day's `daily_logs` points, so a fresh or stale user document could show 0% even after today's log qualified.
- Fix: asset display now projects active challenge progress from today's daily log and requests a background `updateChallengeProgress()` sync when the projection differs from the stored user document.
- Verification: `npm test -- --run tests/challenge-qualification.test.js tests/progressive-loading.test.js`, `npm test`, `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js`, and `git diff --check` all passed.
