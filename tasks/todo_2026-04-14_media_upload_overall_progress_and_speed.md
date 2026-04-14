# 2026-04-14 Media Upload Overall Progress And Speed

## Goal

- Explain why media uploads look stuck after the per-file bar reaches `100%`.
- Replace the floating `업로드 0/1` text-only status with a true overall `0~100%` progress bar for the whole upload/save pipeline.
- Reduce post-upload waiting time by removing unnecessary blocking and network contention.

## Plan

- [x] Review the current upload, background sync, and post-save follow-up flow
- [x] Implement a whole-pipeline background upload progress bar
- [x] Remove avoidable blocking in background media patching and thumbnail finalization
- [x] Defer unrelated post-save network work until uploads finish
- [x] Verify with tests and bundle checks

## Notes

- The current per-slot progress bar is driven by `uploadBytesResumable` byte transfer, but the floating completion chip is driven by later background reconciliation.
- `runBackgroundMediaSyncJobs()` currently performs serial post-upload work and the save flow also starts other network-heavy follow-up tasks immediately after save.

## Review

- Root cause:
  - The slot-level media bar was tied to Storage byte transfer only, so it could hit `100%` before the app finished the later Firestore reconciliation step.
  - Background completion still depended on `runBackgroundMediaSyncJobs()`, which used a read-modify-write patch flow after upload and showed only `업로드 0/1` style counters instead of real whole-pipeline progress.
  - The save flow also kicked off gallery refresh and milestone/challenge follow-up requests immediately, competing with the still-running media work on mobile networks.
- Fix:
  - Replaced the floating text-only status with an overall progress card that shows `0~100%` for the full pipeline and updates continuously while uploads are still in flight.
  - Removed the extra background `getDoc()` read and now patch from the just-saved local/cached log data, which cuts a slow Firestore round-trip out of each media finalize step.
  - Stopped treating thumbnail completion as a user-blocking finish condition. Original media URLs now finalize first, and thumbnail URLs patch in afterward without holding the visible upload completion hostage.
  - Deferred gallery reload and milestone/challenge follow-up network work until background uploads settle, reducing contention during the critical upload window.
  - Added an in-slot `썸네일 제작중` badge for media areas that already have the original file but do not yet have their final thumbnail, so the user sees an explicit intermediate state instead of a confusing blank/placeholder stage.
- Verification:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
  - `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`
