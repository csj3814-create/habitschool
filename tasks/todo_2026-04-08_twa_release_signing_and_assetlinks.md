# 2026-04-08 TWA Release Signing And Asset Links

## Goal

- [x] Add a local-only release signing configuration path for the Android shell
- [x] Add a repeatable assetlinks workflow for the TWA certificate fingerprint
- [ ] Validate fullscreen TWA with the real release keystore on device

## Plan

- [x] Inspect current assetlinks and Android signing state
- [x] Add release signing property loading to the Android Gradle app module
- [x] Fail fast when building release artifacts without release signing configured
- [x] Add a script to compare/write `.well-known/assetlinks.json`
- [x] Document the release-signing and assetlinks workflow
- [ ] Run the workflow with the real release keystore

## Review

- The Android module now supports release signing from either `android/release-signing.properties` or `HABITSCHOOL_ANDROID_*` environment variables.
- Release builds now stop with a clear error if the real signing config has not been supplied.
- `android/scripts/Sync-AssetLinks.ps1` can now check or rewrite `.well-known/assetlinks.json` from the configured signing key, with optional debug fingerprint support for internal testing.
- Local verification used the standard debug keystore through environment variables only to prove the release-signing and assetlinks workflow end to end without touching the real production key.

## Verification

- [x] `cd android && .\gradlew.bat printReleaseSigningStatus`
- [x] `cd . && .\android\scripts\Sync-AssetLinks.ps1 -Mode write -AssetLinksPath %TEMP%\habitschool-assetlinks-check.json`
- [x] `cd android && .\gradlew.bat :app:assembleRelease`
