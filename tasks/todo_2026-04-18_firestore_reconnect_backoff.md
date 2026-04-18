## Firestore Reconnect Backoff

- [x] Review current Firestore offline/failure handling and identify the least invasive hook points
- [x] Add an app-level reconnect scheduler with 1s and 3s retries after retryable Firestore connectivity failures
- [x] Wire the scheduler into the main warning paths that currently only log `client is offline`
- [x] Bump web asset/cache version so the reconnect fix cannot mix with stale PWA modules
- [x] Verify with `npm test`
- [x] Verify with `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`

### Notes

- Goal: improve recovery after transient Firestore backend timeouts without broad architectural change.
- Keep impact narrow: do not rework every Firestore call site, just add a shared scheduler and connect the main catch paths.

### Review

- Added a shared Firestore reconnect scheduler in `js/firebase-config.js` with `1s -> 3s` backoff, online/visibility hooks, and a bounded server probe.
- Wired the scheduler into the main offline-warning catch paths in `app.js`, `auth.js`, and `blockchain-manager.js`.
- Bumped the web asset/service-worker version from `159` to `160` so the reconnect behavior cannot mix with stale cached modules.
- Verification passed:
  - `npm test` -> `175 passed`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
