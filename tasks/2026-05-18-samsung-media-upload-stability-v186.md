# Samsung Internet media upload stability v186

- [x] Review prior Samsung Internet picker/upload lessons.
- [x] Reproduce likely failure points from current source and user screenshots.
- [x] Treat Samsung system picker cancel/failure as a recoverable picker fallback, not a dead-end toast.
- [x] Use a safer Samsung Internet image upload path so image uploads do not sit at 1% in resumable upload.
- [x] Keep selected files in pending/offline/background queues until a real Storage URL exists.
- [x] Rotate runtime to v186.
- [x] Add source guards for the Samsung picker and upload fallback.
- [x] Run `npm test`.
- [x] Run browser bundle check.
- [x] Run `node --check sw.js`.

## Working Notes

- 2026-05-18 reports show Samsung Internet still hitting two visible failure states:
  - Exercise image upload shows "upload delayed" and a global upload progress stuck near 1%.
  - Diet photo picker returns "photo was not selected" even though the user expected the Samsung recent-files picker.
- The next fix should reduce user-visible dead ends and make Samsung image uploads avoid the resumable upload path that can appear stuck on this browser.

## Review

- Samsung Internet image uploads now use a simple `uploadBytes` path after image compression, with a short timeout and no resumable retry loop that can visibly stall at 1%.
- Diet system picker cancel/empty results now open the explicit retry/fallback panel instead of ending at only "photo not selected".
- Generic Samsung image picker failures mark the next tap for the native fallback path, keeping that fallback inside a fresh user gesture.
- Primary save now backs up selected media files to the offline outbox while background upload jobs are still waiting for real Storage URLs, then clears that backup only after all background uploads settle successfully.
- Verification passed: `npm test` (41 files, 292 tests), `node --check sw.js`, `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`, `git diff --check`.
