# 2026-04-08 Android Native Step Handoff

## Goal

- [x] Pass Health Connect step data from the Android shell into the web exercise tab
- [x] Reuse the existing web save flow instead of introducing auto-save
- [x] Show imported-source context in the exercise UI
- [ ] Validate the handoff on a real device after installing the updated APK

## Plan

- [x] Add an Android route that opens the exercise tab with synced-step query parameters
- [x] Update the Health Connect permission activity to prefer that route when a fresh snapshot exists
- [x] Reuse the latest synced snapshot from the widget open action
- [x] Parse the imported payload on the web side and hydrate `_stepData`
- [x] Add a small import banner to the exercise tab
- [x] Preserve the current manual save button flow
- [x] Rebuild the Android APK locally
- [ ] Verify the handoff on a real device after installing the updated APK

## Review

- Android now opens `/?tab=exercise&focus=health-connect-steps...` when a synced Health Connect snapshot is available.
- The web app waits for the initial daily log load before applying this import on login so the imported step count is not overwritten by Firestore hydration.
- The exercise tab now shows a lightweight Health Connect banner and fills the existing step UI, while the final write still happens only when the user taps the normal save button.

## Verification

- [x] `npm test`
- [x] `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
- [x] `cd android && .\gradlew.bat :app:assembleDebug`
