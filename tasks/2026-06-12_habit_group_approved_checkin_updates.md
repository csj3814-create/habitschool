# 2026-06-12 Habit Group Approved Checkin Updates

## Plan
- [x] Review recent lessons and current habit group checkin flow
- [x] Preserve approved review state when a member updates the same day's exercise record
- [x] Harden Firestore rules so approved checkins cannot be demoted by member writes
- [x] Add regression tests for approved update preservation
- [x] Run verification commands

## Notes
- User report: leaders must approve the same member again whenever that member updates exercise information.
- Root cause: the daily log sync path rewrites the habit group checkin with `reviewStatus: 'pending'` and deletes review fields on every qualifying exercise save.
- Required behavior: new or rejected checkins may be pending, but an already approved checkin for the same `groupId + date + uid` must stay approved while exercise snapshots/media are refreshed.

## Review
- `npx vitest run tests/habit-groups.test.js tests/habit-groups-transition.test.js` passed: 15 tests.
- `npm test` passed: 45 files, 322 tests.
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js` passed.
- `node --check functions\runtime.js` passed.
- `git diff --check` passed with line-ending warnings only.
- `firebase deploy --only "firestore:rules" --project staging --dry-run --non-interactive` compiled Firestore rules successfully.
