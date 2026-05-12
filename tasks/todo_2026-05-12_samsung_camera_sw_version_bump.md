# 2026-05-12 Samsung Internet camera fix asset version bump

## Checklist
- [x] Confirm the previous Samsung Internet camera/auth fix changed runtime code without rotating the web asset version.
- [x] Bump browser module URLs from `v176` to `v177`.
- [x] Bump service worker cache name from `habitschool-v176` to `habitschool-v177`.
- [x] Verify no runtime `v176` references remain.
- [x] Run `npm test`.
- [x] Run `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`.

## Review
- Rotated the aligned web/PWA release from `v176` to `v177` across `index.html`, local JS imports, `styles.css` imports, and `sw.js` precache entries.
- Rotated the service worker cache name to `habitschool-v177` so installed Samsung Internet/PWA clients install a new worker and delete the old `habitschool-v176` cache.
- Verification: no runtime `v176` references remain; `npm test` passed 41 files / 285 tests; esbuild browser bundle check passed; `node --check sw.js` passed.
