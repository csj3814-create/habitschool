# 2026-04-27 Reward Market Docs Cleanup

## Goal
- Bring the public changelog and Giftishow submission docs in line with the final reward-market rollout state.

## Plan
- [x] Review changelog and submission docs for outdated `HBT` coupon wording and stale image/logo notes.
- [x] Rewrite the main reward-market submission docs around the current `포인트 교환 + 앱 보관함 + 메가/빽다방 2종` policy.
- [x] Refresh `changelog.html` so the latest reward-market improvements and logo cleanup are visible with readable Korean copy.

## Review
- Rewrote `docs/giftishow_submission_service_overview_ko.md` around the current reward-market policy:
  - app points as the coupon exchange asset
  - HBT kept separate from coupon issuance
  - app-vault coupon delivery
  - Mega MGC and Paikdabang launch items
- Rewrote `docs/giftishow_submission_commercial_key_package_ko.md` so the commercial-key submission summary matches the current production direction.
- Rebuilt `changelog.html` into clean UTF-8 Korean copy and added a new `v1.0.9` entry for:
  - Giftishow product imagery
  - approved local brand logos
  - reward-market daily-limit bug fix
  - simplified market guidance

## Verification
- `node -e "const fs=require('fs'); const html=fs.readFileSync('changelog.html','utf8'); if(!html.includes('v1.0.9')||!html.includes('2,000P')) process.exit(1); console.log('changelog ok')"`
- `node -e "const fs=require('fs'); const doc=fs.readFileSync('docs/giftishow_submission_service_overview_ko.md','utf8'); if(!doc.includes('Giftishow')||!doc.includes('HBT')||!doc.includes('2,000P')) process.exit(1); console.log('service overview ok')"`
