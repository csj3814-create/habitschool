# 2026-04-21 Admin Daily Points Chart

## Plan
- [x] Review lessons and inspect the admin dashboard chart layout plus daily points aggregation path
- [x] Add a 7-day daily awarded-points chart next to the daily active users chart
- [x] Run verification, record results, and note any worthwhile additional admin metrics

## Notes
- Keep the existing `TOP 5` table in place and split the left chart box into two panels.
- Reuse the same awarded-points sources already used by the dashboard:
  - `daily_logs.awardedPoints`
  - `blockchain_transactions` challenge settlement rewards
  - `monthly_rewards`
  - welcome/referral day bonuses from `users`

## Review
- Added a second bar chart for `7일 일별 지급 포인트` to the right of `7일 일별 활성 유저`.
- Updated the dashboard summary card for today's points to use the same daily totals map as the new chart.
- Verification:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
