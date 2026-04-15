# 2026-04-16 Widget Size And Manual Health Connect Sync

## Goal

- Shrink the Android home widget from the current wide card to a compact 2x2 footprint.
- Make the in-app `Health Connect에서 가져오기` CTA return reliably to the current web context with imported step payload intact.

## Plan

- [x] Audit widget provider size/layout resources and the manual Health Connect round-trip path
- [x] Implement a compact 2x2 widget layout and provider sizing
- [x] Preserve the current app return URL for manual Health Connect sync and harden the native handoff
- [x] Run web tests, bundle check, and Android debug build

## Notes

- This slice focuses on Android shell UX. It does not change Firestore schema or on-device Health Connect aggregation rules.

## Review

- The home widget now targets a compact 2x2 footprint by shrinking its provider min width and replacing the dual-button wide layout with a single sync CTA plus root-tap open behavior.
- The manual `Health Connect에서 가져오기` CTA now sends Android a validated `returnTo` URL built from the current app mode/path, so native sync returns to the right web context before applying the imported step payload.
- `NativeEntryActivity` now accepts only same-origin Habitschool return URLs and falls back to the default exercise route when the return target is missing or invalid.
- `HealthConnectPermissionActivity` no longer fails silently when a manual sync throws; it stays on the native screen with retry/open options instead of bouncing back with no imported steps.

## Verification

- `npm test`
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
- `cd android && .\gradlew.bat :app:assembleDebug`
