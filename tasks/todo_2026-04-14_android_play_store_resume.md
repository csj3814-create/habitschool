# 2026-04-14 Android Play Store Resume

## Goal

- Re-audit the Android shell and identify what is still required before resuming Google Play submission.
- Verify the current local Android project state instead of relying on the earlier release notes.
- Tighten any Android release docs/scripts that still point to APK-first publishing when Play needs an AAB flow.

## Plan

- [x] Review the existing Android/TWA release notes and current project files
- [x] Verify release-signing, assetlinks, target SDK, and release artifact readiness
- [x] Update any Android release docs/scripts that should prefer Play-ready AAB output
- [x] Summarize remaining external blockers in plain language

## Notes

- This audit is about Google Play resumption, not just local Android debug builds.
- External blockers like the real upload keystore or Play Console form state may still need manual follow-through after the codebase is ready.

## Review

- The Android shell itself is still intact: `android/app` exists, the manifest still declares the TWA entry activity and Health Connect permission flow, and `:app:assembleDebug` still succeeds locally.
- `targetSdk = 35` and `compileSdk = 36` are already set in [android/app/build.gradle.kts](/C:/SJ/antigravity/habitschool/android/app/build.gradle.kts), so the project is aligned with the current Play target API floor for phone apps.
- The immediate blocker is release signing. The repo-local readiness check reports that `android/release-signing.properties` (or equivalent env vars) is not configured, and there is no local `android/signing/` directory in this environment.
- The current local outputs only include APKs. To make Play resumption clearer, the release guide and readiness script now prefer building both `bundleRelease` and `assembleRelease`, with the AAB called out as the Play upload artifact.
- `.well-known/assetlinks.json` already contains fingerprints for `com.habitschool.app`, but the current environment cannot verify which one matches the real release keystore until the signing config is restored.
- Play-specific Health Connect paperwork is still required outside the repo: Data safety, privacy policy alignment, and the Health apps declaration form.

## Verification

- `powershell -ExecutionPolicy Bypass -File .\android\scripts\Check-TwaReleaseReadiness.ps1`
- `cd android && .\gradlew.bat :app:tasks --all | Select-String 'bundleRelease|assembleRelease|printReleaseSigningStatus'`
- `cd android && .\gradlew.bat :app:assembleDebug`
