# 2026-07-01 Media Save Retry Before Failure

## Context
- Report: uploading photos and videos together, then pressing save/points, may show a partial upload failure.
- Desired behavior: retry automatically first, and only show failure after retries are exhausted.

## Plan
- [x] Review media upload lessons and current worktree state.
- [x] Trace save-time pending upload failure path.
- [x] Patch retry-before-fail behavior.
- [x] Add or update regression tests.
- [x] Run required verification.

## Findings
- Save first waits briefly for selected media uploads, then stores the record and moves unfinished media into background jobs.
- The background media path did retry from the selected file once after the pending upload lost its URL.
- If that single retry failed, the progress tracker immediately showed the partial upload failure state.
- Photo plus video uploads can hit that path when one transfer stalls or times out while the other succeeds.

## Review
- Added job-level background upload retries with short backoff before final failure.
- The progress tracker now shows a retrying state while automatic attempts are still running.
- Bumped PWA asset version from `v220` to `v221`.
- Verification passed:
  - `npx vitest run tests/video-upload-resilience.test.js tests/diet-photo-persistence.test.js`
  - `npm run check:en`
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js`
