# 2026-04-28 Mobile Loading And Challenge Progress

## Goal
- Stop mobile first paint from showing 0P when cached/user point data exists.
- Reduce gallery skeleton-only time by rendering cached/local feed before slow Firestore enrichment.
- Make weekly/master habit challenge progress count any day with 65P+ from daily logs, including yesterday.

## Checklist
- [x] Trace point badge first-paint path and cache fallback.
- [x] Trace gallery skeleton path and feed fallback.
- [x] Trace weekly/master active challenge progress calculation.
- [x] Patch cache-first loading and daily-log-based challenge reconciliation.
- [x] Add regression coverage.
- [x] Run verification.

## Review
- User reports mobile often opens with 0P, gallery skeleton stays 5-10 seconds, and 2026-04-27 70P did not count toward weekly challenge.
- Point first paint now uses the last trusted local point value before Firestore returns, and cached 0 from Firestore will not overwrite a fresher non-zero local balance.
- Gallery now persists the latest rendered feed in localStorage and hydrates it before slow Firestore/REST refresh work, so the initial view is not skeleton-only when prior feed data exists.
- Active weekly/master challenge progress is reconciled from every daily log in the challenge date range, including previous 65P+ days, in both asset display projection and the blockchain-manager transaction path.
- Verified with `npm test`, `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js`, and `git diff --check`.
