# 2026-04-21 Galaxy Login Loop Revisit

## Plan
- [x] Review recent Galaxy login fixes, current auth branching, and the first-screen repaint conditions.
- [x] Fix the remaining Galaxy browser login loop and add a regression check.
- [x] Verify with tests/build and summarize the root cause.

## Review
- The remaining loop was not another grace-window timing issue. The affected Galaxy browser path was still taking the forced Samsung Internet `redirect` branch, and on some devices `getRedirectResult()` never restored a user back into the app.
- The fix pivots normal Samsung Internet browser tabs back to `popup` login, which avoids the fragile cross-origin redirect restore path. `redirect` is now reserved for Samsung standalone mode only.
- If a Samsung redirect flow still fails or expires without restoring auth, the device now stores a local `popup` override so the next attempt will not repeat the same redirect loop.
- Added regression coverage for Samsung browser mode selection and override behavior.
- Verified with `npm test`, `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`, and `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`.
