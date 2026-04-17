# 2026-04-17 Android launcher loading ANR root cause

> Status: completed

## Plan
- [x] Inspect launcher startup path and existing ANR/TWA notes
- [x] Re-check emulator launch behavior and logs
- [x] Remove synchronous Health Connect permission work from the launcher critical path
- [x] Replace "wait on launcher screen" fallback with automatic in-app WebView fallback
- [x] Verify tests, web bundle check, Android build/install, and cold-start launcher behavior

## Findings
- The primary launcher still had a cold-start risk even after the earlier TWA fixes.
- `HabitschoolLauncherActivity` synchronously checked `HealthConnectManager.hasRequiredPermissions()` via `runBlocking` on the main thread before handing off to the web surface.
- On devices where Health Connect IPC is slow, that synchronous permission check can pin the launcher on the branded loading screen and contribute to ANR.
- The launcher also relied on the user to manually escape the loading screen if TWA handoff stalled.

## Changes
- Removed automatic Health Connect permission probing from the primary launcher startup path.
- Kept cached same-day Health Connect snapshot reuse, because that path is local and cheap.
- Switched trusted-surface launch to `TwaLauncher` with `WEBVIEW_FALLBACK_STRATEGY`.
- Added automatic `WebViewFallbackActivity` handoff when trusted-surface launch times out or throws, instead of leaving the user on the loading screen.
- Kept manual browser fallback UI as a last-resort escape hatch if WebView fallback itself cannot start.

## Verification
- `npm test` -> 171 passed
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
- `cd android && .\gradlew.bat :app:assembleDebug :app:installDebug`
- Emulator cold start after force-stopping both app and Chrome:
  - 15-second observation: top activity reached `com.android.chrome/...CustomTabActivity`
  - 30-second observation: no `ANR`, `Input dispatching timed out`, `TWA launch timed out`, or `Opened browser surface` log lines

## Review
- This fix intentionally prioritizes launcher stability over eager Health Connect auto-sync.
- Explicit Health Connect import, widget flows, tile flows, and cached snapshot reuse remain intact.
- Real-device confirmation on the user's Samsung device is still needed before calling the Android launcher fully closed.
