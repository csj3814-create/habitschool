# 2026-04-27 Initial Login Asset/Gallery Timeouts

## Goal
- Fix first-login cases where optional Firestore timeouts leave asset metrics at zero.
- Fix gallery skeletons that stay visible when first social/feed queries are slow.
- Keep optional slow queries from blocking the main UI, while ensuring later retries replace fallback UI.

## Checklist
- [x] Inspect asset-display timeout and retry flow.
- [x] Inspect gallery first paint and retry flow.
- [x] Patch the root cause with narrow changes.
- [x] Add tests for stale fallback recovery.
- [x] Run verification.

## Review
- User reported repeated `[asset-display] optional ... timed out` logs, zero asset-derived displays, and gallery skeletons after first login.
- Asset tab root cause: token stats, mini-chart, today deltas, and daily limit were effectively gated by a short user-doc race or rendered timeout/null query results as empty numeric data.
- Gallery root cause: authenticated first paint waited through repeated SDK retries before REST fallback, leaving skeletons visible too long on cold Firestore/WebChannel starts.

## Verification
- `npm test -- --run tests/progressive-loading.test.js tests/gallery-loading.test.js`
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js`
- `npm test`
- `git diff --check` passed with only CRLF normalization warnings.
