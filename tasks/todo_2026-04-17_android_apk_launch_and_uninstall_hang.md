# 2026-04-17 Android APK Launch And Uninstall Hang

## Goal

- Fix the installable Android APK so tapping the app always opens Habitschool instead of silently doing nothing.
- Eliminate the stuck state where the app becomes hard to uninstall right after a failed launch.
- Restore the original launcher icon behavior while keeping the shell stable.

## Plan

- [x] Review the current launcher/fallback flow and note likely failure paths
- [x] Reproduce install, launch, and uninstall behavior with adb or emulator logs
- [x] Fix the root cause in the Android shell
- [x] Rebuild and verify install, launch, relaunch, force-stop, and uninstall
- [x] Record results and update lessons

## Review

- The launcher no longer depends on a transparent `LauncherActivity` handoff for normal app opens. It now shows a visible loading screen, preserves the Health Connect pre-sync checks, and sends regular app launches straight to a Chrome browser tab instead of a custom-tab/TWA surface.
- Share intents still keep the Android Browser Helper TWA path so the existing share-target bridge remains available where it matters.
- The main launcher task now finishes cleanly after handing control to Chrome, which removes the lingering shell state that previously made the app feel unresponsive and hard to uninstall on device.

## Verification

- `npm test`
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
- `cd android && .\gradlew.bat :app:assembleDebug`
- `cd android && .\gradlew.bat :app:installDebug`
- `adb -s emulator-5554 shell am start -S -n com.habitschool.app/.HabitschoolLauncherActivity`
- `adb -s emulator-5554 shell dumpsys activity activities`
- `adb -s emulator-5554 shell am force-stop com.habitschool.app`
- `adb -s emulator-5554 shell pm uninstall com.habitschool.app`
