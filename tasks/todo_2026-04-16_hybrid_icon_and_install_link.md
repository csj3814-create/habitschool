## 2026-04-16 Hybrid App Icon + Install Link

### Plan
- [x] Review Android launcher icon resources and release/install distribution options
- [x] Reduce the adaptive icon foreground scale so the hybrid app icon does not look zoomed in
- [x] Build a fresh Android APK that includes the icon fix
- [x] Root-cause the install-time launcher failure on a real Android runtime path
- [ ] Publish a sendable install link and deploy production
- [ ] Verify production web response and document limits/notes

### Notes
- Release signing may not be configured on this machine, so a debug APK may be the only immediately buildable install artifact.
- Keep unrelated Android release-doc changes out of this work unless they are directly required.

### Progress
- Adaptive launcher art was replaced with a clean vector foreground in `android/app/src/main/res/drawable/ic_launcher_foreground.xml` and the launcher background was softened for a cleaner Samsung-style icon silhouette.
- Added a stable hosting redirect at `/install/android-debug.apk` that points to the built debug APK path.
- Verified with `npm test`, `npx esbuild ...`, and `cd android && .\gradlew.bat :app:assembleDebug`.
- After user feedback, reverted the launcher wiring back to the original bitmap face icon (`@mipmap/ic_launcher_foreground_actual`) while keeping the larger insets so the icon is less zoomed on Samsung launchers.
- Verified the normal Chrome/TWA launch path on an emulator, then disabled Chrome to reproduce the remaining crash. The actual second root cause was a missing `com.google.androidbrowserhelper.trusted.WebViewFallbackActivity` manifest entry, which made `WEBVIEW_FALLBACK_STRATEGY` crash with `ActivityNotFoundException`.
- Added the fallback activity declaration and re-verified both launch modes: with Chrome enabled the app opens as a Custom Tab / TWA, and with Chrome disabled it stays alive in `WebViewFallbackActivity`.

### Follow-up
- Root cause of the broken install build was not the APK signature but a launcher crash in `HabitschoolLauncherActivity`: it called `super.getLaunchingUrl()` before `LauncherActivity` had initialized its metadata.
- Added a user-facing install alias at `/install/android.apk`.

### Review
- Keep the install link unpublished until the new APK is redeployed; the previously published prod APK still lacks the fallback-activity fix.
- The launcher icon request was not a rebrand request. Future icon work should preserve the original artwork and only tune adaptive-icon padding or masks unless the user explicitly asks for new art.
