# 2026-06-22 Admin Assets and Mining Rate Audit

## Plan
- [x] Inspect the Assets & HBT user table, search, and pagination implementation
- [x] Add exact filtered-name results and direct page navigation
- [x] Trace the weekly mining-rate decision scheduler and production history
- [x] Record every weekly decision, including no-change decisions
- [x] Add regression tests and verify the admin UI in the browser

## Notes
- Existing unrelated challenge-staking changes are already present in the worktree and must be preserved.
- Target flow: control tower -> Assets & HBT -> search by name -> see only matching names -> jump directly to a requested page.

## Review
- Assets & HBT now filters the full in-memory member asset list by name, shows filtered/total counts, and accepts a direct page number with range clamping.
- The production scheduler is enabled and runs every Monday at 00:00 KST. Its 2026-06-22 run failed because the `network + status + type + date` Firestore composite index was missing.
- Added the required composite index plus a fallback query that keeps the weekly decision working while the index is building.
- Weekly history now records `evaluating`, `success`, `no_change`, `chain_error`, and top-level `error` outcomes.
- Fixed the week key to use the correct KST ISO week. The 2026-04-06 legacy record was stored as `2026-W13`; the correct ISO week is `2026-W15`.
- Production history currently contains only the 2026-04-06 no-change record. Missing historical decisions were not fabricated.
- Verification:
  - `npm test` -> 48 files, 345 tests passed.
  - App bundle, Cloud Functions bundle, and extracted admin module bundle all passed esbuild.
  - Local `admin.html` loaded without browser console errors; the authenticated data view remains behind the expected Google admin login.
