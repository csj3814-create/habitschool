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

- The launcher still preserves the Health Connect pre-sync checks, but normal app opens now pre-warm Custom Tabs before launching the Habitschool trusted surface. When Chrome is slow, the app keeps the branded loading screen visible instead of dropping the user onto a blank white browser surface.
- Browser fallback is now truly a last resort. The launcher explicitly resolves a real external browser package and excludes `com.habitschool.app`, which prevents the timeout path from reopening the app's own verified-link activity in a loop.
- The installed shell still exits cleanly after handoff, so force-stop and uninstall remain healthy even after a cold-start launch attempt.
- Emulator verification showed the key UX improvement: at the 10-second mark the user now sees the Habitschool loading screen rather than a blank Chrome/custom-tab page, and by the 30-second mark the login screen is visible.

## Verification

- `npm test`
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
- `cd android && .\gradlew.bat :app:assembleDebug`
- `cd android && .\gradlew.bat :app:installDebug`
- `adb -s emulator-5554 shell am start -S -n com.habitschool.app/.HabitschoolLauncherActivity`
- `adb -s emulator-5554 shell screencap -p /sdcard/habitschool-open-warm.png`
- `adb -s emulator-5554 shell screencap -p /sdcard/habitschool-open-warm-30s.png`
- `adb -s emulator-5554 shell dumpsys activity activities`
- `adb -s emulator-5554 shell am force-stop com.habitschool.app`
- `adb -s emulator-5554 shell pm uninstall com.habitschool.app`
