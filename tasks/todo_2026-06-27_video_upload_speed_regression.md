# 2026-06-27 Video Upload Speed Regression

## Context
- Report: video upload speed feels slower on staging after recent fixes.
- Goal: identify whether the slowdown is actual Storage transfer time, thumbnail/save acknowledgement waiting, browser-specific upload transport, or Firestore/network confirmation latency.

## Plan
- [x] Review relevant upload lessons and current worktree state.
- [x] Compare the latest deployed commit against the previous commit for video upload paths.
- [x] Trace exercise video upload flow: file picker, original upload, thumbnail upload, pending upload resolution, save/background patch.
- [x] Check timeout/progress constants and browser-specific Samsung Internet paths.
- [x] Decide whether code needs a fix or whether this is expected/perceived latency from current waiting behavior.
- [x] Verify with tests/build after the thumbnail preview fix.

## Findings
- Latest deployed staging assets are `v217`.
- The 2026-06-27 save acknowledgement fix added `waitForOriginalMs` support to `resolvePendingUploadResult()`, but video callers do not pass that option. The new 6.5s original-upload wait is for static images/sleep images, not exercise videos.
- Exercise videos still start upload immediately after selection through `previewDynamicVid()` -> `uploadVideoWithThumb()` -> `beginTrackedPendingUpload()`.
- The likely perceived slowdown is the older thumbnail persistence change from commit `2bfc1b6`:
  - `getStrengthThumbSaveWaitMs()` changed from local/no-local `0ms/1200ms` to `2200ms/3600ms`.
  - Save/background patch paths now wait briefly for `videoThumbUrl` before writing exercise media when the original video URL is already available.
- This was intentional to prevent the previously reported refresh bug where exercise video thumbnails disappeared after a reload, but it can make video save/upload completion feel slower by up to about 2.2-3.6s per relevant strength video state.
- Current staging console did not show Firestore warnings during a fresh read-only load. Prior staging verification did show intermittent Firestore WebChannel delay, so network/save ACK latency can still compound the perceived delay on affected devices.
- Follow-up report: after a video upload completes in the exercise tab, the thumbnail is not appearing.
- Root cause found: for large exercise videos, `scheduleStrengthLocalThumbExtraction()` returns `null`, so the UI initially shows the video placeholder and thumbnail work is deferred until `uploadVideoWithThumb().thumbPromise`. That later promise updated pending metadata/persistence state, but did not update the live `.preview-strength-img`.
- Additional replacement-path issue: selecting a new video on an existing strength block did not clear stale `data-url`, which could block the resolved thumbnail from being applied to the current preview.
- Fix: add `updateStrengthPreviewAfterResolvedThumb()` and call it when local or remote deferred video thumbnails resolve; clear stale saved URL/thumbnail metadata when a new strength video file is selected.

## Review
- Fixed in `js/app-core.js`.
- Added regression coverage in `tests/video-upload-resilience.test.js`.
- Bumped runtime/static cache version to `v218` so mobile/PWA clients fetch the updated module set.
- Verification passed:
  - `npm test` (51 files, 360 tests)
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js`
- Browser plugin validation limitation: local `127.0.0.1`/`localhost` navigation was blocked by the in-app browser with `ERR_BLOCKED_BY_CLIENT`; file URL navigation was also blocked by browser policy. No policy workaround was attempted.
