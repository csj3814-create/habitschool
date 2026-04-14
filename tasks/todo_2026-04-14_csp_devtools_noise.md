# 2026-04-14 CSP DevTools Noise

## Plan
- [x] Review recent lessons and current CSP settings
- [x] Add the minimum `connect-src` allowance needed for Firebase CDN source-map fetches
- [x] Keep admin and main app CSP in sync
- [x] Verify the app still builds cleanly

## Notes
- User reported red CSP errors in Chrome DevTools on production and asked whether they were safe to ignore.
- Goal: remove the `www.gstatic.com` source-map CSP noise without broadening runtime permissions beyond what the app needs.

## Review
- Findings:
  - The red console entries against `https://www.gstatic.com/firebasejs/...js.map` were DevTools source-map fetches being blocked by CSP, not production runtime code attempting an unsafe connection.
  - The main hosting CSP in `firebase.json` and the inline CSP in `admin.html` both allowed Firebase scripts from `www.gstatic.com`, but neither allowed DevTools' follow-up source-map fetches through `connect-src`.
  - The app's actual emulator/localhost connection code remains guarded to local hostnames only, so production traffic is not falling back to `127.0.0.1`.
- Implemented:
  - Added `https://www.gstatic.com` to the production `connect-src` policy in `firebase.json`.
  - Added the same `https://www.gstatic.com` allowance to `admin.html` so the admin surface does not keep a stricter, noisier CSP than the main app.
- Verification:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
  - `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-main-check.js`
