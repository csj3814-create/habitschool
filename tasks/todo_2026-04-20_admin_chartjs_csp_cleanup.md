# 2026-04-20 Admin Chart.js CSP Cleanup

## Plan
- [x] Review the admin page Chart.js/CSP setup and keep the fix local to admin
- [x] Replace the external Chart.js CDN dependency with a pinned local vendor asset
- [x] Keep CSP tight instead of widening `connect-src` for DevTools source-map fetches
- [x] Run test/build verification and record the result

## Notes
- User reported red CSP errors in Chrome DevTools on `/admin.html`.
- Goal: remove the noise in a clean way without broadening runtime permissions for the whole app.

## Review
- Findings:
  - The red console entries on `/admin.html` were DevTools source-map fetches for CDN-hosted `Chart.js`, not a runtime failure in the admin dashboard itself.
  - Broadening `connect-src` just to permit source-map fetches would loosen policy for the whole surface without improving real runtime behavior.
- Implemented:
  - Added a pinned local vendor copy at `js/vendor/chart.umd.min.js`.
  - Removed the `sourceMappingURL` trailer from the vendored file so DevTools no longer makes the blocked `.map` request.
  - Switched `admin.html` to the local script and removed `cdn.jsdelivr.net` from the admin page's inline `script-src`.
- Verification:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
