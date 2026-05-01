# 2026-05-01 SW v171 staging

## Goal
- Bump the service worker cache version so deployed clients pick up the latest fixes.
- Commit, push, and deploy the current verified changes to Firebase staging.

## Checklist
- [x] Bump `sw.js` cache version
- [x] Run verification
- [x] Commit and push `main`
- [x] Deploy staging hosting
- [x] Document result

## Result
- Bumped the PWA release from `v170` to `v171` across `index.html`, module import query strings, `styles.css` imports, and `sw.js` cache/precache entries.
- Committed and pushed `main`.
- Deployed Firebase Hosting staging: `https://habitschool-staging.web.app`.
- Verification:
  - `npm test` passed: 39 files, 273 tests
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js` passed
  - `git diff --check` passed with line-ending warnings only
