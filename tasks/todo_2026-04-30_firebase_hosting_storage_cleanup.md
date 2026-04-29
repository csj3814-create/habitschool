# 2026-04-30 Firebase Hosting storage cleanup

## Goal
- Stop Firebase Hosting from uploading repo/internal files such as `.git`, logs, temp bundles, tests, and docs.
- Verify the new hosting payload is much smaller on staging and production.
- Delete old Hosting versions with the minimal retention policy: production app 5, default site 2, staging 2.

## Checklist
- [x] Review lessons and current hosting config
- [x] Tighten `firebase.json` hosting ignore
- [x] Run tests/build checks
- [x] Deploy staging and production hosting
- [x] Dry-run and delete old Hosting versions
- [x] Recheck version storage totals and document results

## Notes
- User-uploaded diet/exercise/mind media lives in Firebase Storage, not Firebase Hosting.
- Latest hosting cache before the fix had about 6,092 files / 131.92 MB, with `.git` contributing about 122.89 MB.
- Added Hosting ignore rules for repo internals, logs, docs, tests, temp outputs, package metadata, and local env files.
- `firebase.json` parsed successfully, `npm test`, esbuild bundle, and `git diff --check` passed.
- Staging hosting deploy found 68 files; `.firebase/hosting..cache` measured about 2.61 MB. Staging `/`, `/admin.html`, and `/sw.js` returned 200.
- Production hosting deploy found 68 files; production `/`, `/admin.html`, and `/sw.js` returned 200.
- Cleanup dry-run expected reclaim: `habitschool` about 11.59 GB, `habitschool-8497b` about 1.36 GB, `habitschool-staging` about 27.02 GB.
- Deleted old `FINALIZED` Hosting versions through the Firebase Hosting REST API. Remaining `FINALIZED` retention now matches policy: `habitschool` 5, `habitschool-8497b` 2, `habitschool-staging` 2.
- Remaining `FINALIZED` version bytes are about 459.03 MB for `habitschool`, 32.70 MB for `habitschool-8497b`, and 125.96 MB for `habitschool-staging`. Deleted version byte totals may still appear in the API/console until Firebase finishes backend cleanup.
