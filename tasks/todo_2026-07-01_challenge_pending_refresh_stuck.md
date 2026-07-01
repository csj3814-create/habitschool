# 2026-07-01 Challenge Pending Refresh Stuck

## Context
- Report: asset tab stays on the challenge pending status card after refresh.
- Screenshot date: 2026-07-01.
- Wallet point/HBT values render, but the health challenge body remains pending.

## Plan
- [x] Review lessons and current worktree state.
- [x] Trace the pending-state refresh path and identify the bottleneck.
- [x] Patch the smallest stale-pending behavior.
- [x] Run `npm test` and esbuild verification.

## Findings
- The slow path is `updateAssetDisplay(true)` forcing `getDocFromServer(users/{uid})`.
- That server-only user document read is raced against `ASSET_USER_DOC_TIMEOUT_MS = 5000`.
- When the user document is deferred, the previous UI rendered only the pending card and the retry button repeated the same forced refresh.
- Challenge settlement itself is not the main bottleneck. The UI was waiting on the user document even when cached user data or today's `challenge_settlement` transaction could resolve the card state.

## Changes
- Cache challenge user fields inside the asset display cache after a successful user document read.
- When the user document is deferred, render the challenge card from fresh asset/dashboard cache.
- If today's settlement transaction is available, remove settled challenge tiers from cached user data before rendering.
- After claim success, optimistically remove the settled challenge from the cached challenge state before the forced refresh completes.
- Bumped PWA asset version from `v219` to `v220`.

## Verification
- `npx vitest run tests/challenge-restart-flow.test.js tests/progressive-loading.test.js`
- `npm run check:en`
- `npm test`
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js`
