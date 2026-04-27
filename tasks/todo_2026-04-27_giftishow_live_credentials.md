# 2026-04-27 Giftishow Live Credentials

## Goal
- Wire the approved Giftishow Biz production credentials without committing secrets.
- Confirm the reward-market live path reads production values from environment/secrets.

## Checklist
- [x] Inspect Giftishow/reward-market config and gitignore.
- [x] Store or document live credentials through a non-committed secret path.
- [x] Update code/tests/docs only if the existing path is incomplete.
- [x] Run verification.

## Review
- User provided approved production Giftishow authentication key, token key, banner ID, and card ID.
- These values must not be committed to tracked source files.
- Reward market live readiness now also requires the Giftishow card/template ID and banner ID, so live issuance cannot appear ready with an incomplete provider request template.
- Added ignore rules for local reward-market live env overlays.

## Verification
- `node -c functions/reward-market.js`
- `npm test -- --run tests/reward-market.test.js`
- `npm test`
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js`
- `git diff --check` passed with only existing CRLF normalization warnings.
