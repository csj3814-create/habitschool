# 2026-05-15 Samsung Internet Photo Picker v178

## Checklist
- [x] Keep the verified camera upload path stable.
- [x] Split the library/photo selection path from camera capture behavior.
- [x] Prefer image-only `showOpenFilePicker()` when available outside Android/Samsung Internet.
- [x] Use an image-only file input fallback without `capture`.
- [x] Prevent focus/pageshow/visibilitychange from immediately cleaning picker state.
- [x] Rename the library CTA copy to clearer photo selection wording.
- [x] Rotate PWA asset versions to v178.
- [x] Add source regression tests for the picker behavior.
- [x] Run `npm test`.
- [x] Run `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`.
- [x] Run `node --check sw.js`.

## Review
- `npm test` passed: 41 files, 286 tests.
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js` passed.
- `node --check sw.js` passed.
- No remaining v177 runtime references outside historical task notes.
- Follow-up: Android/Samsung Internet now skips `showOpenFilePicker()` so users do not get trapped by denying the first OS permission prompt.
- Follow-up: camera return auth grace was extended from 45 seconds to 90 seconds for slower Samsung Internet/Firebase Auth recovery.
- Follow-up: auth and the HTML shell now read the persisted media picker marker directly so a camera-return reload cannot show the login modal before `app-core.js` finishes loading.
