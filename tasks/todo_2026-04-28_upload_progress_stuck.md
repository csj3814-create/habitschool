# 2026-04-28 Upload Progress Stuck

## Goal
- Find why image uploads can sit around 93% for too long and fail to feel complete.
- Make the final upload/save phase observable and bounded so the user does not get stuck with misleading progress.

## Checklist
- [x] Inspect upload progress calculation and save flow.
- [x] Identify the 93% plateau source.
- [x] Patch finalization timeout/status handling if needed.
- [x] Add regression coverage.
- [x] Run verification.

## Review
- User reported photo upload staying at 93% for too long on production.
- Root cause: background media progress reaches 93% after Storage transfer finishes, then waits on an unbounded Firestore daily_logs patch.
- Added an 8s timeout, local retry queue, and online/focus/visibility flush hooks for deferred media URL patches.
- Verification: `npm test`; `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js`.
