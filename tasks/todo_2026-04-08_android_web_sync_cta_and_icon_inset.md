# 2026-04-08 Android Web Sync CTA And Icon Inset

## Goal

- [x] Keep the Android launcher icon readable inside adaptive icon masks
- [x] Add an in-app exercise-tab CTA that starts native Health Connect sync
- [ ] Verify the CTA and icon on a real Android device after installing the next APK

## Plan

- [x] Add an inset-safe adaptive launcher foreground drawable
- [x] Add an exported Android deep-link router for native sync entry
- [x] Show an Android-only Health Connect CTA in the exercise guide actions
- [x] Reuse the existing Health Connect import return flow after sync
- [ ] Build the next debug APK and check the updated flow on device

## Review

- The launcher icon now uses an inset foreground so the logo and text stay inside Samsung/One UI adaptive icon masks.
- The exercise tab can now trigger native Health Connect sync directly through a `habitschool://health-connect/sync` route handled by the Android shell.
- The web app keeps the Android-shell context in session storage so the CTA survives deep-link cleanup after returning from native sync.

## Verification

- [ ] `npm test`
- [ ] `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
- [ ] `cd android && .\gradlew.bat :app:assembleDebug`
