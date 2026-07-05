# 2026-07-05 Media Upload Resilience

## Context
- User reported two diet photos showing "일부 업로드 실패" after save.
- User also reported exercise video uploads becoming very slow after updates.
- Target: prevent fragile upload regressions, especially on mobile/Samsung Internet.

## Plan
- [x] Review previous upload lessons and current pending/background upload code.
- [x] Identify why two images can enter failed background state.
- [x] Make transient upload failures retry automatically before showing failure.
- [x] Remove avoidable sequential bottlenecks in background media sync.
- [x] Preserve thumbnail/patch behavior and offline outbox recovery.
- [x] Bump PWA release version after runtime JS changes.
- [x] Verify with focused tests, full tests, and esbuild.

## Findings
- Background media jobs are currently processed one-by-one, so multiple photos/videos multiply perceived wait time.
- Samsung Internet simple image/video upload paths use zero internal upload retries, so a transient timeout can become a visible failed job.
- The background retry loop exists, but it also processes jobs sequentially; failures on multiple selected items are slow and noisy.
- PWA version edits must be UTF-8 safe; a first PowerShell rewrite attempt corrupted Korean text and was reverted before reapplying with safe tooling.

## Review
- Added one retry for Samsung Internet simple upload transport before surfacing a failed upload result.
- Changed background media sync so independent media uploads resolve concurrently, while Firestore daily-log patches still pass through a sequential patch chain.
- Kept deferred thumbnail patch behavior and offline outbox backup/replay paths intact.
- Bumped PWA/runtime asset version from v222 to v223.
- Verification:
  - `npx vitest run tests/video-upload-resilience.test.js tests/diet-photo-persistence.test.js tests/pwa-versioning.test.js`
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js`
  - `npm run check:en`
