# 2026-07-01 Admin Dashboard Blank Load

## Context
- Report: production admin dashboard stays blank with summary cards showing `-` and table loading for a long time.
- Screenshot route: `https://habitschool.web.app/admin`.
- DevTools screenshot later shows data eventually appears, plus a Firestore WebChannel listen 404.
- User also requested prod deployment.

## Plan
- [x] Confirm current worktree and admin surface.
- [x] Trace admin dashboard data loader and identify blocking Firestore calls.
- [x] Patch loading fallback if the UI can remain blank too long.
- [x] Verify with tests/build checks.
- [ ] Deploy to prod after committing and pushing.

## Findings
- `loadDashboard()` waited for the shared `daily_logs` + `users` reads before rendering any cards.
- The dashboard then waited for recent logs, reports, token stats, and bonus point aggregation in one `Promise.all`, so one slow Firestore/callable path could leave the whole view on `-`/`loading`.
- The refresh button only cleared the shared cache on the members tab, so dashboard refresh could reuse stale cache instead of forcing a new admin read.
- Patch: dashboard reads now have bounded fallback, render `확인 중` for delayed data instead of false zeroes, and top/challenge tables show a clear retry message when member reads are delayed.

## Review
- Added `tests/admin-dashboard-loading.test.js` to lock the bounded progressive loading behavior.
- Verification passed: `npx vitest run tests/admin-dashboard-loading.test.js tests/korean-text-integrity.test.js`.
- Verification passed: `npm test`.
- Verification passed: `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js`.
