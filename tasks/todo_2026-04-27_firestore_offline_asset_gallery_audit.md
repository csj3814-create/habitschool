# 2026-04-27 Firestore Offline Asset/Gallery Audit

## Goal
- Prevent Firestore reconnect/offline states from making points show as 0, HBT disappear, or gallery/photos render empty.
- Identify the shared bottleneck behind repeated optional check timeout logs.

## Checklist
- [x] Review existing Firestore reconnect/loading lessons and code paths.
- [x] Trace asset display, gallery, point/HBT, and optional social queries.
- [x] Patch shared loading/fallback behavior with narrow impact.
- [x] Add or update regression tests.
- [x] Run project verification.

## Review
- Work started after production console showed repeated optional check delays and Firestore `client is offline` messages while assets/gallery displayed incomplete data.
- Root bottleneck: Firestore SDK reconnect/WebChannel failures were being converted into empty snapshots in daily logs and asset user-doc reads.
- Asset fix: show cached/dashboard points in both the asset card and header, and start onchain HBT loading independently from the `users` document.
- Daily-log fix: persist last good daily logs locally, use REST fallback on SDK delay, and keep the current media UI instead of clearing it when connectivity is only deferred.
- Gallery fix: logged-in gallery loads fall back to REST when SDK reads time out or return an empty offline cache.
- Verification: `npm test` passed 36 files / 256 tests, and `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js` completed.
