# 2026-04-12 Gallery Post-Save Hydration

## Goal

- Prevent the gallery tab from appearing empty when the user moves there right after saving photo/video records.

## Plan

- [x] Review the save flow and gallery cache lifecycle around immediate tab switches
- [x] Identify why recent uploads can leave the gallery with an empty cache before fresh data arrives
- [x] Implement a cache-preserving refresh path and optimistic gallery hydration
- [x] Verify with tests and bundle checks

## Review

- Root cause: the save flow cleared `cachedGalleryLogs` immediately after `setDoc`, then kicked off `loadGalleryData()` asynchronously. If the user switched to the gallery before the fresh read finished, the tab rendered against an empty cache and showed a blank/empty state.
- Fix: keep the last known gallery cache during refresh, optimistically upsert the just-saved `daily_logs` item into `cachedGalleryLogs`, and let a delayed `loadGalleryData(true)` reconcile with Firestore in the background.
- Safety: force reload failures now preserve the existing gallery feed instead of replacing it with an empty/error state when cached logs already exist.
- Verification:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
  - `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`
