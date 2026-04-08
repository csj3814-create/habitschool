# 2026-04-08 Health Connect Samsung Health Alignment

## Goal

- [x] Explain and reduce the step-count mismatch between Samsung Health and the imported Health Connect value
- [x] Prefer Samsung Health-origin step data when it is available through Health Connect
- [x] Show the imported provider label in the exercise-tab banner so the source is explicit

## Plan

- [x] Inspect the current Health Connect aggregation path and confirm whether it reads all origins
- [x] Update Android sync to prefer Samsung Health's Health Connect origin and fall back to aggregate totals
- [x] Pass the provider label back to the web exercise flow and update banner/toast copy
- [ ] Add a short task note and lesson, then verify web and Android builds

## Review

- The Android Health Connect sync previously read only the aggregate total across all data origins, so it could differ from the Samsung Health number shown to the user.
- The sync path now prefers `com.sec.android.app.shealth` via `dataOriginFilter` when Samsung Health data exists in Health Connect, and falls back to the generic aggregate only when Samsung Health-origin data is absent.
- The exercise-tab import banner and toast now show the provider label that supplied the imported steps, which makes future mismatches easier to explain.

## Verification

- [x] `npm test`
- [x] `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
- [x] `cd android && .\gradlew.bat :app:assembleDebug`
