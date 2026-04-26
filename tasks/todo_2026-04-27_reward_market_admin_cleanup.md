# 2026-04-27 Reward Market Admin Cleanup

## Checklist
- [x] Check the current admin coupon-monitoring action labels and visibility rules.
- [x] Rename and simplify the provider recheck action to match what it actually does.
- [x] Remove internal quote-version noise from the admin row layout.
- [x] Re-run tests and bundle verification.

## Notes
- The old `보관함 재확인` label described the user vault, but the action really re-queries provider coupon data.
- Showing internal quote metadata like `phase1_fixed_internal:...` adds noise for operators and looks like an error.
- Recheck should stay focused on rows that still need provider confirmation.

## Review
- Changed the admin action label to `쿠폰 재조회` and removed the manual reason prompt. The client now sends a fixed internal reason key, `admin_provider_recheck`.
- Removed `quoteVersion` from the admin row so internal pricing-version strings no longer show in the control tower.
- Pointed the legacy `renderRewardMarketCatalog()` path at the current catalog renderer so stale quote-meta UI cannot reappear.
- Verified with `npm test`, `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`, and `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`.
