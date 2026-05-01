# 2026-05-01 Social timeout console cleanup

## Goal
- Stop optional social challenge/community Firestore timeouts from piling up as warning/error-looking console messages.
- Keep the main dashboard fast by preserving cached/fallback UI when social data is slow.
- Reduce duplicate social challenge fetches triggered by repeated renders.

## Checklist
- [x] Inspect social challenge and community focus timeout paths
- [x] Add cache/in-flight/retry behavior or log suppression where appropriate
- [x] Add regression coverage for timeout logging
- [x] Run tests and bundle verification
- [x] Document result

## Notes
- Screenshot shows repeated `social_challenge_readiness_timeout`, `social_challenges_timeout`, and `community_friend_status_timeout` warnings.
- These are optional friendship/community enrichments and should not look like user-facing app errors when fallback UI is being used.

## Result
- Root cause: dashboard, community focus, and social challenge cards could trigger overlapping friend/social challenge Firestore reads after login or hard refresh. Expected optional timeouts were then printed repeatedly with warning-level console messages.
- Fix: social challenge readiness and open challenge queries now reuse in-flight promises and a short cache; community focus refresh is also in-flight deduped. Optional timeouts keep cached/fallback UI and are hidden in production unless `globalThis.__HABITSCHOOL_DEBUG_OPTIONAL_DATA` is enabled.
- Verification:
  - `npm test` passed: 39 files, 273 tests
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js` passed
  - `git diff --check` passed with line-ending warnings only
