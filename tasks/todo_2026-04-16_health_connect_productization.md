# 2026-04-16 Health Connect Productization

## Goal

- Reduce Android shell launch friction by reusing a fresh Health Connect snapshot instead of always bouncing through native sync.
- Preserve Health Connect source metadata in the web daily log so saved records keep their provider, sync time, and native entry context.
- Keep widget/tile/manual sync behavior aligned with the same snapshot contract.

## Plan

- [x] Audit the Android launch path, snapshot freshness rules, and web step-save schema
- [x] Implement fresh-snapshot reuse on Android app launch with a bounded freshness window
- [x] Persist Health Connect metadata in the web step payload and restore the banner accurately after reload
- [x] Add focused regression tests and run web + Android verification

## Notes

- This slice does not yet move Health Connect data directly from Android to Firestore outside the web save flow.
- The goal is to make the existing bridge feel product-grade before expanding the architecture further.

## Review

- `HabitschoolLauncherActivity` now reuses a fresh same-day Health Connect snapshot on Android app launch, attaching it directly to the TWA URL instead of always bouncing through the native sync screen.
- The new `HealthConnectSnapshotDecider` centralizes same-day/freshness checks so launcher reuse and widget prefill follow the same contract and avoid replaying yesterday's cached steps.
- The web exercise flow now stores Health Connect provider label, native entry source, and sync timestamp inside `daily_logs.steps`, so saved records keep the correct banner context after reload.
- Manual step entry and screenshot analysis still clear native metadata cleanly, so Health Connect state does not leak into other step sources.

## Verification

- `npm test`
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
- `cd android && .\gradlew.bat :app:assembleDebug`
