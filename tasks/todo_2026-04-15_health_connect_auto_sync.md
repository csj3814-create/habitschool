# 2026-04-15 Health Connect Auto Sync

## Goal

- Remove the extra tap for users who already granted Health Connect permission in the Android shell.
- Auto-sync steps on Android app launch, then return the user to the original web destination instead of forcing the exercise tab.
- Keep the existing manual Health Connect button as a fallback.

## Plan

- [x] Audit the Android launcher, Health Connect native flow, and web deep-link consumption path
- [x] Implement automatic Health Connect sync on Android app launch when permission is already granted
- [x] Preserve the original target URL while attaching imported step payload to the return trip
- [x] Update the web deep-link handler so Health Connect payload can be consumed without forcing an exercise-tab redirect
- [x] Verify Android build plus web test/bundle checks

## Notes

- App launch auto-sync and in-page browser refresh are different layers. This task focuses on Android app launch/login recovery first.
- The manual sync CTA in the exercise tab stays in place for retries and for cases where the app is running outside the Android shell.

## Review

- `HabitschoolLauncherActivity` now detects Android-shell launches where Health Connect is already available and permission is already granted, then hands off to the native Health Connect sync flow before opening the TWA.
- `HealthConnectPermissionActivity` now returns to the original requested web URL with the step-import payload attached, instead of forcing every successful sync back to the exercise tab.
- The web app now consumes `health-connect-steps` payload on any landing tab, silently updates the step state when the user opened another tab first, and only focuses/toasts aggressively when the destination is actually the exercise tab.
- This closes the extra-tap gap for Android app launch/login recovery after permission has already been granted, while keeping manual sync as the fallback path.
- Plain in-page refresh inside an already-open TWA still remains a separate problem because it does not re-enter the Android launcher activity.

## Verification

- `npm test`
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
- `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-main-check.js`
- `cd android && .\gradlew.bat :app:assembleDebug`
