# 2026-04-10 Functions Upgrade + Exercise Upload Flow

## Plan

- [x] Review current exercise video upload behavior and identify where upload starts too early
- [x] Upgrade `firebase-functions` and `firebase-admin` in `functions/`
- [x] Change exercise video flow so upload/save progress starts only after pressing the save CTA
- [x] Run verification commands and record deployment readiness

## Review

- `firebase-functions` was upgraded from `7.2.2` to `7.2.5`, and `firebase-admin` from `12.7.0` to `13.8.0`.
- Exercise video uploads still start in the background for responsiveness, but save-button progress is now gated until the user presses `운동 저장하고 포인트 받기`.
- The exercise video save fallback path was also fixed to await `uploadVideoWithThumb().promise` correctly, so direct-save uploads no longer read `url` from the wrapper object by mistake.

## Verification

- `npm test`
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
- `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`
- `cd functions && npm ls firebase-functions firebase-admin`
