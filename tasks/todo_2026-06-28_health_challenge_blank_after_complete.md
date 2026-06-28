# 2026-06-28 Health Challenge Blank After Complete

## Context
- Report: after tapping the 3-day health habit challenge completion button and waiting, completion did not process.
- After refresh, the asset tab's "건강 습관 챌린지" box renders only the title/description with an empty body.
- Screenshot date: 2026-06-28.

## Plan
- [x] Review challenge-related lessons and current worktree state.
- [x] Trace 3-day health challenge completion/claim flow from asset tab button to Cloud Function.
- [x] Trace asset tab challenge renderer and identify why the body can be blank.
- [x] Patch the smallest root cause and add regression coverage.
- [x] Run `npm test` and esbuild verification.

## Findings
- `claimChallengeReward()` succeeded through the Cloud Function path but only did a single asset refresh afterward.
- If the forced user-doc refresh was slow or deferred, the asset tab kept cached point/HBT values while the challenge DOM stayed at its initial `display: none` state.
- That left the outer "Health Habit Challenge" card visible with only title/description and no progress, completion, or restart body.
- The fix reuses the challenge mutation refresh helper after claim and renders a pending challenge state instead of leaving the card blank while the user doc is delayed.

## Review
- `npm test` passed: 51 files, 360 tests.
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js` passed.
- `npm run check:en` passed.
- PWA asset version bumped from `v218` to `v219` for staging deployment.
- `git diff --check` passed with only CRLF normalization warnings.
