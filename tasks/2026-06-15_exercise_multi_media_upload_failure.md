# 2026-06-15 Exercise Multi Media Upload Failure

## Plan
- [x] Review upload-related lessons and current worktree
- [x] Trace exercise image/video upload and save paths
- [x] Identify why mixed or multiple video uploads fail while multiple diet photos succeed
- [x] Patch the upload/save flow so exercise records persist when video uploads are deferred or partially complete
- [x] Preserve uploaded exercise video thumbnails after refresh
- [x] Add regression tests for the multi-media failure pattern
- [x] Run project verification

## Notes
- User report: uploading two diet photos together works, but uploading two exercise videos or a video plus photo shows upload failure and does not save.
- Likely risk area: exercise media uses pending/background upload paths for image/video blocks, unlike simpler diet photo slots.
- Root cause found: exercise list items are normalized away while their upload URL is pending, and the offline outbox replay only patches an existing `mediaId` item instead of inserting a missing cardio/strength item.
- Related thumbnail risk: strength video `videoThumbUrl` can stay empty if the original upload finishes before thumbnail upload/backfill, so replay and background paths must carry `thumbUrl` through.

## Review
- Updated automatic media uploads to suppress premature hard failure toasts so save-time background retry/offline replay owns the final outcome.
- Added `upsertOfflineOutboxExerciseMedia()` so exercise cardio/strength items are inserted during offline replay when the original save had no URL-backed list item yet.
- Offline replay now waits for thumbnail uploads, writes `videoThumbUrl`/`imageThumbUrl`, and recalculates awarded points before replaying the daily log.
- Strength video refresh fallback now hydrates missing thumbnails from cached local thumbnails or by extracting a frame from the persisted video URL.
- Verification passed:
  - `npx vitest run tests/video-upload-resilience.test.js`
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js`
  - `git diff --check`
