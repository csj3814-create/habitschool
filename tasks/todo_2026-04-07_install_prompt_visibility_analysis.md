# 2026-04-07 install prompt visibility analysis

## Goal
- Identify when the first-screen Habitschool install CTA may fail to appear.
- Cross-check app code conditions against current browser and platform install behavior.

## Plan
- [x] Inspect the install prompt code path, timers, and visibility gates in the app.
- [x] Compare browser-specific install support and prompt eligibility from official docs.
- [x] Summarize concrete cases where users will not see the install CTA.

## Review
- The app only shows the first-screen install banner after the `beforeinstallprompt` event fires in `js/pwa-install.js`.
- The banner is also blocked if `localStorage.pwa_install_dismissed` exists, if the app is already installed, or if the browser/device does not support install prompting.
- On iOS, custom in-app prompting is the main gap: the current banner logic depends on `beforeinstallprompt`, but iOS installation generally requires manual browser UI instead of that event-driven flow.
- The current banner auto-hides after 6 seconds, so even when it appears it can be easy to miss.
