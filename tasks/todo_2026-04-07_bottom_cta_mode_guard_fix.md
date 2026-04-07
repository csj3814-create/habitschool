# 2026-04-07 bottom CTA mode guard fix

## Goal
- Keep the gallery bottom CTA in chat mode without being reset to the orange save CTA.
- Keep the dashboard install CTA pinned to the record tab bottom bar without being overwritten by shared save-bar updates.

## Plan
- [x] Inspect the shared bottom CTA update flow and identify where special modes are overwritten.
- [x] Guard gallery chat mode and dashboard install mode from shared save-bar resets.
- [x] Run verification and summarize the final behavior.

## Review
- `updateContextualSaveBar()` now returns early for `dashboard` and `gallery` so the shared save CTA logic no longer overwrites the install CTA or gallery chat CTA.
- The dashboard path reapplies the install CTA in place, while the gallery path preserves the dedicated Kakao chat CTA styling and label.
- Verified with `npm test` and `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`.
