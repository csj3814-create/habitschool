# 2026-04-27 Reward Market Docs Cleanup

## Checklist
- [x] Rewrite the reward-market submission docs in clean UTF-8 Korean and align them to the current point-based coupon flow.
- [x] Refresh changelog `v1.0.9` so it captures the latest reward-market UI, vault, and admin improvements.
- [x] Re-read the updated docs/changelog and run the standard checks.

## Notes
- The current markdown source for the Giftishow submission docs contains broken text encoding and no longer reflects the latest mobile/vault polish.
- `v1.0.9` should summarize the whole reward-market cleanup wave, not just the earlier image swap and quota fix.

## Review
- `docs/giftishow_submission_service_overview_ko.md` and `docs/giftishow_submission_commercial_key_package_ko.md` were rewritten in clean UTF-8 Korean to reflect the current point-based coupon flow, app vault delivery, and control-tower operations.
- `changelog.html` now uses `v1.0.9` to summarize the broader reward-market cleanup wave, including mobile vault polish, barcode scan UX, validity copy, and admin wording updates.
- Verified by re-reading the UTF-8 markdown sources plus running `npm test` and `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`.
