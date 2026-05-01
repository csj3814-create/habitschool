# 2026-05-01 Repeating Firestore and asset retry loop

## Goal
- Stop repeated production console noise from Firestore reconnect probes and asset optional query timeouts.
- Prevent the assets transaction card from staying in a permanent loading state when Firestore is slow or reconnecting.
- Keep cached/fallback asset UI visible while retries back off.

## Checklist
- [x] Inspect Firestore reconnect probe and asset retry scheduling
- [x] Add backoff/log throttling for repeated reconnect and asset retry paths
- [x] Ensure asset history loading state resolves on timeout/fallback
- [x] Run targeted and full verification
- [x] Document result

## Notes
- Production screenshot shows repeated `firestore-watch-assertion` reconnect probe timeouts plus `asset-display` retry logs.
- The visible asset transaction card remains in "거래 기록을 확인하는 중입니다", so this is not just cosmetic logging.
- Root cause: token stats/onchain balance success paths cleared the shared asset retry counter, so a delayed user document retry could be repeatedly reset and rescheduled.
- UI fix: when the user document is deferred, asset history now leaves the loading state and shows a cache/fallback retry state instead of an indefinite wait.

## Review
- Production asset debug logs are hidden unless `globalThis.__HABITSCHOOL_DEBUG_ASSET === true`.
- Firestore reconnect probe scheduling is debounced by reason so the same watch assertion cannot flood the console.
- PWA/cache version bumped to `v173` so the browser receives the retry-loop fix.
- Verification passed: `npm test`, `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js`, `git diff --check`.
