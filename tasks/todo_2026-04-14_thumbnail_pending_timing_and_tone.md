# 2026-04-14 Thumbnail Pending Timing And Tone

## Goal

- Prevent the `썸네일 제작중` state from appearing before the media is actually usable.
- Keep any intermediate thumbnail state subordinate to the real media preview.
- If the feature keeps regressing the core UX, remove it and return to the pre-feature baseline.
- Make saved exercise video thumbnails appear immediately after refresh in both the exercise tab and gallery.

## Plan

- [x] Review where thumb-pending state is toggled during pre-upload, save, and reload flows
- [x] Restrict the visible state to committed media only
- [x] Restyle the pending indicator to be softer and blur-based
- [x] Verify with tests and bundle checks
- [x] Roll back the `썸네일 제작중` UI entirely at the user's request
- [x] Persist local exercise video thumbnails beyond the current session and reuse them in gallery
- [x] Refresh the gallery share-card media cache when a strength-video thumbnail becomes available
- [x] Let the gallery share-card include strength videos even before a sync thumb source is already in memory
- [x] Add a server-side share-card thumbnail fallback for strength videos that arrive from another device/browser
- [x] Reconcile `strengthList` items with matching legacy `strengthVideoThumbUrl` data so the exercise tab and share card do not drop an existing saved thumbnail

## Notes

- The original `startTrackedUpload()` flow marked the file transfer as done before the record save and later thumbnail patch fully settled, which made the pending state easy to mis-time.
- Saved and reloaded media already use separate restoration paths through `persistSavedPreview()`, `persistSavedExerciseBlock()`, and `loadDataForSelectedDate()`.
- Recent fixes also added safer pending-upload preservation and saved-video fallback handling, so a full rollback should keep those lower-level fixes while removing only the badge and blur UI concept.
- The remaining delay after refresh came from paths that still fell back to live video frames when `videoThumbUrl` was missing and the extracted local thumbnail had only been cached in `sessionStorage`.
- A separate regression versus the April 13 baseline came from save-path timing: the upload-speed refactor stopped waiting briefly for exercise video `thumbPromise`, so records could be saved before `videoThumbUrl` was attached.
- The gallery "해빛 루틴" share card keeps a separate prepared-media cache, so a later-arriving strength-video thumbnail can be missed unless that cache is invalidated and rebuilt.
- The share-card collector was also stricter than the gallery feed: it could exclude strength videos unless a sync thumb source already existed at collection time, which prevented the later async cache lookup from even trying.
- Browser-local thumbnail caches only help on the same device/browser that extracted the video frame. When the user uploads on mobile and later opens the gallery share card on desktop, only a persisted `videoThumbUrl` or a server-generated fallback can fill that tile.
- A later regression showed that some docs still carry a valid legacy `strengthVideoThumbUrl` while the newer `strengthList` entry for the same video has no `videoThumbUrl` yet. Any list-first restore path must merge those two shapes before falling back to a live `<video>` frame.

## Review

- Root cause:
  - The pending indicator was attached to several different lifecycle stages and kept conflicting with what the user could already see on screen.
  - Separately, stored exercise videos without a finalized `videoThumbUrl` still depended on a session-scoped local cache, so refresh and gallery paths could miss the extracted thumbnail and wait for a slow live-frame fallback instead.
- Final fix:
  - Removed badge creation and blur styling for `썸네일 제작중`.
  - Removed the remaining auto-show conditions so the app no longer tries to decide when the pending badge should appear.
  - Expanded the extracted exercise-video thumbnail cache from `sessionStorage` to a bounded persistent cache and let gallery video rendering consult that cache before using a `<video>` fallback.
  - Kept the newer upload and thumbnail persistence fixes underneath so background thumbnail storage can still complete without the extra status chrome.
  - Bumped asset and service-worker versions whenever these UI/runtime fixes changed so staging reliably receives the latest code.
- Verification:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
  - `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-main-check.js`

## Follow-up

- Earlier follow-up fixes tightened render guards, limited the state to videos, preserved pending uploads during replacement saves, reused local video thumbnails, and kept background thumb backfills alive.
- The rollback removed `썸네일 제작중` from the product surface entirely.
- The latest follow-up extends local video-thumb recovery to persistent browser storage and gallery rendering, so old records without a server-side `videoThumbUrl` can still show the already extracted thumbnail immediately on the same device.
- Another follow-up restores a bounded thumbnail wait during strength-video save, matching the older behavior more closely. If the thumb resolves within that short window, the saved record and gallery cache keep the thumbnail immediately; otherwise the existing background patch path still finishes it later.
- A further follow-up closes the race where users save before local thumbnail extraction finishes. The app now binds the extracted thumbnail to the final uploaded video URL as soon as either side resolves, so refresh and gallery paths can find it immediately even when save timing is tight.
- The latest follow-up also refreshes the gallery share-card media cache when a strength-video thumbnail resolves locally or through a background patch, so the shared "해빛 루틴" card can pick up the real thumbnail instead of keeping an older placeholder.
- Another follow-up lets the share-card collector keep strength-video entries based on the video URL itself, then resolves their thumbnail asynchronously from the persistent local cache during media preparation.
- The latest follow-up adds a server-side fallback inside `prepareShareMediaAssets`, so if a strength-video item still has no persisted thumb URL and no same-browser cache, the share-card callable can derive a thumbnail directly from the stored video object.
- The latest follow-up also reconciles list-based strength-video items with matching legacy `strengthVideoThumbUrl` fields, which prevents the exercise tab and the share-card collector from discarding an already saved thumbnail during schema transition.
