# 2026-04-20 Large File Refactor

## Goal

- [x] Reduce oversized source files enough to avoid large inline-preview issues
- [x] Split `js/app.js`, `functions/index.js`, and `styles.css` along safe feature boundaries
- [x] Preserve runtime behavior and versioned asset loading
- [x] Re-run required verification after refactor

## Plan

- [x] Identify extraction boundaries with the lowest coupling
- [x] Move frontend feature blocks into smaller JS modules and wire imports
- [x] Move CSS feature sections into imported partial stylesheets
- [x] Move backend notification/reminder helpers into a separate Functions module if needed
- [x] Run `npm test`, `npx esbuild ...`, and `node --check functions/index.js`

## Review

- Reduced the entry files that were tripping inline-preview limits: `styles.css` is now a thin import hub, `js/app.js` is a slim browser entrypoint, and `functions/index.js` is a small Functions entry shim.
- Preserved runtime URLs and service-worker precache coverage by adding the new partial CSS files and `js/app-core.js` to `sw.js`.
- Updated source-inspection tests to follow the delegated implementation files so architectural extraction does not create false failures.
- Verification passed: `npm test`, `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`, `node --check functions/index.js`, and `node --check functions/runtime.js`.
