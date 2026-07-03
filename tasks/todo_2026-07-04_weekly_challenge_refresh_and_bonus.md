# 2026-07-04 Weekly Challenge Refresh And Bonus

## Context
- Report: after starting the 7-day weekly challenge and completing HBT escrow, the asset tab does not immediately show the challenge as ongoing unless refreshed.
- Report: a 100% completed weekly challenge returned only 5,000 HBT, but the UI promises 5,000 principal + 2,500 bonus = 7,500 HBT.

## Plan
- [x] Review challenge-related lessons and current worktree.
- [x] Trace client challenge start refresh flow and server settlement payout flow.
- [x] Patch immediate active challenge rendering after successful start.
- [x] Patch weekly/master 100% HBT bonus payout if the server only returns principal.
- [x] Add/update regression tests for both behaviors.
- [x] Run focused tests, full test suite, and esbuild.

## Findings
- Challenge start succeeded on the server, but the client waited for `updateAssetDisplay(true)` to fetch the refreshed user document before rendering the active weekly card. If that server refresh was delayed or fell back to cache, the UI kept showing the start card until a later refresh.
- Weekly/master bonus rates can exist on older records as `0` or missing values. Treating nonpositive stored rates as authoritative on paid tiers could suppress the 50%/200% completion bonus even when the UI promised it.
- Settlement history stored only one `amount`, which made it hard to distinguish returned principal from the completion bonus.

## Review
- Added an optimistic challenge-start response path: the callable now returns the active challenge payload, and the client immediately seeds the asset cache and renders the ongoing card before Firestore refresh catches up.
- Paid challenge bonus policy now falls back to the tier default when stored paid-tier rate is nonpositive. Full-success settlement now records `principalRewardHbt`, `bonusRewardHbt`, `targetBonusRewardHbt`, and `hbtReceived`.
- PWA cache version rotated to `v222`.
- Verification passed:
  - `node --check functions/runtime.js`
  - `npx vitest run tests/challenge-stake-isolation.test.js tests/pwa-versioning.test.js tests/korean-text-integrity.test.js`
  - `npm test`
  - `npm run check:en`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
