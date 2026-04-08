# 2026-04-08 Android share sheet and icon regression

## Goal
- Restore Habitschool as a visible Android share-sheet target for image sharing.
- Fix the launcher icon so Samsung/One UI does not crop it down to only the face.
- Verify whether the missing share entry was a real regression in the APK or a mismatch between the installed PWA share target and the native shell.

## Plan
- [x] Compare the current Android manifest/resources with the earlier share-target expectations and recent git history.
- [x] Implement a native Android image share entry point if the APK no longer exposes one.
- [x] Re-tune the adaptive launcher icon foreground so the branded mark fits Samsung masks cleanly.
- [x] Run web checks plus Android assembleDebug and summarize reinstall steps for the updated APK.

## Review
- Root cause: the Android shell never declared the native TWA share-target manifest pieces, so the visible share-sheet entry the user remembered was most likely the installed PWA share target rather than the APK.
- Fix: added Android Browser Helper share-target metadata, `SEND` and `SEND_MULTIPLE` image intent filters, and the required `DelegationService` to the launcher activity path.
- Safety: the launcher now skips appending the `native=android-shell` query when invoked from Android share intents so the `/share-target` POST route stays intact.
- Branding: the adaptive icon foreground inset now shrinks and lifts the bundled logo so Samsung's mask should preserve the lower text instead of cropping down to only the face.
- Internal testing path: `.well-known/assetlinks.json` now includes both the existing release fingerprint and the local debug fingerprint so the debug APK can validate TWA share handoff during device testing.
- Verification:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
  - `cd android && .\gradlew.bat :app:assembleDebug`
