# 2026-06-22 Admin Transaction Search and Pagination

## Plan
- [x] Add member-name search and direct page navigation to recent HBT transactions
- [x] Add member-name search and direct page navigation to all point awards
- [x] Reuse the shared admin filtering and pagination helpers
- [x] Add regression tests and verify the rendered admin controls

## Target Flow
- Control tower -> Assets & HBT -> search a member in each transaction table -> see only matching rows -> jump directly to a requested page.

## Review
- Recent HBT transactions now load the latest 500 records, attach member names, and support filtered result counts plus direct page movement.
- The HBT table now includes a member column and recognizes the common transaction hash fields used by conversion, staking, and settlement records.
- All point-award rows now support the same member-name filter, filtered counts, and clamped direct page movement.
- Verification:
  - `npm test` -> 49 files, 348 tests passed.
  - Admin module and app bundles passed esbuild.
  - Local admin page loaded with no console warnings/errors; all four new controls were present in the DOM.
  - Authenticated data interaction remains behind Google administrator login, so live Firestore rows were not changed during browser QA.
