# 2026-06-17 Multi Exercise Video Upload Stall

## Plan
- [x] Review upload-related lessons and current worktree
- [x] Trace exercise video picker, pending upload, save, and refresh restoration
- [x] Fix multi-video upload progress and partial-save behavior
- [x] Ensure exercise video thumbnails survive refresh
- [x] Add regression tests and run verification

## Notes
- User report: selecting two exercise videos can stay at upload 1%, one video may not upload, refresh removes the draft, and thumbnails are missing.
- Screenshot shows two strength video blocks in pending upload UI with footer `업로드 0/1 1%`, which suggests pending upload counting/progress is not tracking both active videos.
- Root cause: validated selected files were not retained outside `input.files`, so mobile picker/file-input clearing could leave save/offline paths seeing only part of a multi-media selection.
- Root cause: offline outbox merge restored `saveData` only; URL-less exercise videos were correctly excluded from server save data, but no pending placeholder was injected for refresh-time UI recovery.
- Fix: retain validated selected files in a WeakMap until removal/persistence, use it in save/offline backup paths, and inject pending exercise placeholders with local video thumbnails from the outbox.

## Review
- Added selected-file fallback retention after validated media picks and cleared it on removal/rejection/persistence.
- Added offline outbox pending exercise placeholders so URL-less background uploads survive refresh in the UI without counting for points until Storage URLs exist.
- Added pending strength video local thumbnail restoration.
- Verification: `npm test`, `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`, and `git diff --check` all passed.
