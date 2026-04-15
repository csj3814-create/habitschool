## 2026-04-16 Hybrid App Icon + Install Link

### Plan
- [x] Review Android launcher icon resources and release/install distribution options
- [x] Reduce the adaptive icon foreground scale so the hybrid app icon does not look zoomed in
- [x] Build a fresh Android APK that includes the icon fix
- [ ] Publish a sendable install link and deploy production
- [ ] Verify production web response and document limits/notes

### Notes
- Release signing may not be configured on this machine, so a debug APK may be the only immediately buildable install artifact.
- Keep unrelated Android release-doc changes out of this work unless they are directly required.

### Progress
- Adaptive launcher foreground was shrunk by increasing the inset padding in `android/app/src/main/res/drawable/ic_launcher_foreground_inset.xml`.
- Added a stable hosting redirect at `/install/android-debug.apk` that points to the built debug APK path.
- Verified with `npm test`, `npx esbuild ...`, and `cd android && .\gradlew.bat :app:assembleDebug`.
