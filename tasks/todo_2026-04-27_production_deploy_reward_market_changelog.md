# 2026-04-27 Production Deploy Reward Market Changelog

## Checklist
- [x] Confirm the production Firebase target and current deploy commit.
- [x] Run the standard verification checks on the current `main` state.
- [x] Deploy `hosting,functions` to the production Firebase project.
- [x] Smoke-check the production site and changelog response.

## Notes
- Production target is `habitschool-8497b` from `.firebaserc`.
- The worktree has only untracked draft assets/scripts outside the deploy scope.

## Review
- Verified `main` commit `578a636` with `npm test` and `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`.
- Deployed `hosting,functions` to `habitschool-8497b` after retrying once with a longer timeout.
- Confirmed `https://habitschool.web.app` responded `200` and production changelog served the latest user-facing `v1.0.9` copy.
