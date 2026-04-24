# 2026-04-24 Reward Market Points Pivot Staging Rollout

## Goal
- Deploy the point-based reward-market pivot to the staging environment.
- Keep HBT flows intact while gifticon redemption runs on off-chain points in staging.

## Plan
- [x] Review modified files and exclude unrelated local artifacts from the rollout.
- [x] Re-run validation for functions and browser bundles before deployment.
- [x] Commit the intended staging rollout changes and push `main`.
- [x] Deploy the updated Firebase resources to the staging target and record the result.

## Review
- Intended rollout scope is the point-based reward-market pivot plus the supporting user phone field rule change; unrelated local `docs/`, `scripts/`, and env/example artifacts remain unstaged.
- Validation completed before deploy prep:
  - `node -c functions/reward-market.js`
  - `node -c functions/runtime.js`
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
  - `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`
- Commit / push:
  - `e7a1ded` `Pivot reward market redemption to points`
  - pushed to `origin/main`
- Staging deploy:
  - `firebase deploy --project staging --only "hosting:app,functions,firestore:rules"`
  - Hosting URL: `https://habitschool-staging.web.app`
  - Verified `reward-market-grid`, `reward-coupon-list`, `tab-reward-market`, and `reward-market-admin-tbody` are present in the deployed HTML responses.
