# 2026-04-30 Firebase Hosting storage cleanup

## Goal
- Stop Firebase Hosting from uploading repo/internal files such as `.git`, logs, temp bundles, tests, and docs.
- Verify the new hosting payload is much smaller on staging and production.
- Delete old Hosting versions with the minimal retention policy: production app 5, default site 2, staging 2.

## Checklist
- [x] Review lessons and current hosting config
- [x] Tighten `firebase.json` hosting ignore
- [x] Run tests/build checks
- [ ] Deploy staging and production hosting
- [ ] Dry-run and delete old Hosting versions
- [ ] Recheck version storage totals and document results

## Notes
- User-uploaded diet/exercise/mind media lives in Firebase Storage, not Firebase Hosting.
- Latest hosting cache before the fix had about 6,092 files / 131.92 MB, with `.git` contributing about 122.89 MB.
- Added Hosting ignore rules for repo internals, logs, docs, tests, temp outputs, package metadata, and local env files.
- `firebase.json` parsed successfully, `npm test`, esbuild bundle, and `git diff --check` passed.
