# 2026-04-17 Gallery Feed Skeleton Hang

## Goal

- Stop the gallery feed from getting stuck on skeleton cards after first login or immediately after uploads.
- Make gallery refresh resilient even when friendship loading or Firestore/gallery fetches stall.

## Plan

- [x] Re-check gallery loading, login bootstrap, and post-save refresh paths for a shared blocking dependency
- [x] Make initial gallery render non-blocking with respect to friendship loading
- [x] Add stale in-flight gallery load recovery and fetch timeouts so repeated reloads can recover
- [x] Add regression coverage for the hardened gallery loading contract
- [x] Verify with project test and bundle checks

## Review

- The gallery feed could render the hero/header, set skeleton cards, and then wait indefinitely before the first real feed paint.
- The main culprit was that `_loadGalleryDataInner()` launched friendship loading in parallel but still awaited it before rendering the feed, so a slow or stuck friendship query could freeze the visible gallery.
- A second issue was that the gallery load gate had no stale-reset logic, so once `_galleryLoadingPromise` got stuck, later reloads could pile up behind the same in-flight promise.
- The fix keeps the first feed paint independent from friendship loading, rerenders once friendships eventually arrive, and wraps both REST and Firestore gallery fetches in explicit timeouts. Stale in-flight gallery loads are now discarded so later retries can recover.

## Verification

- `npm test`
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
