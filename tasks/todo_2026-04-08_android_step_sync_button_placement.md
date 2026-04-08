# 2026-04-08 Android Step Sync Button Placement

## Goal

- [x] Move the Health Connect action into the "Today's steps" card under the manual input row
- [x] Preserve Android-shell context on normal launcher entry so the action appears reliably
- [x] Verify the web bundle and Android debug build before shipping

## Plan

- [x] Remove the sync action from the collapsible exercise guide action row
- [x] Add a smaller support action inside the step card right panel
- [x] Append the Android native marker at launcher entry instead of depending on later deep links
- [x] Update notes and lessons after the user correction
- [x] Run `npm test`, esbuild bundle check, and `:app:assembleDebug`

## Review

- The Health Connect entry point now sits inside the step card, directly below the manual step input row, so it stays discoverable even when the exercise guide is collapsed.
- `HabitschoolLauncherActivity` now appends `native=android-shell` to trusted web launches that target `habitschool.web.app`, so the web layer can reliably show Android-only support actions on normal app entry.
- The button copy was softened from a large CTA tone to a contextual "import from Health Connect" action that fits the step-entry workflow better.

## Verification

- [x] `npm test`
- [x] `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
- [x] `cd android && .\gradlew.bat :app:assembleDebug`
