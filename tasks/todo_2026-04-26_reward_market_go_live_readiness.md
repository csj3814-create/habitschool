# 2026-04-26 Reward Market Go-Live Readiness

## Goal
- Use the Giftishow commercial-key waiting period to prepare everything except the final provider approval switch.
- Be ready to run one real coupon issuance test as soon as the commercial key is approved.

## Plan
- [x] Prepare the real `reward_catalog` defaults for the first live products (`메가MGC커피 (ICE)아메리카노 60일`, `빽다방 아메리카노(ICED) 60일`).
- [ ] Prepare the production/staging Giftishow env block with the approved endpoint paths and non-secret fixed values.
- [ ] Confirm the internal tester accounts, saved reward recipient phone numbers, and the first E2E test script.
- [ ] Finalize the operator SOP for `pending_issue`, `issued`, and `failed_manual_review`.
- [ ] After commercial-key approval, top up bizmoney, switch live mode, and run one controlled staging issuance test.

## Review
- Updated the reward-market defaults so the global minimum can start at `500P`, while the first two 60-day coffee items are each fixed at `2000P`.
- Seeded the fallback catalog with the approved goods codes:
  - `메가MGC커피 (ICE)아메리카노 모바일쿠폰` -> `G00002321189`
  - `빽다방 아메리카노(ICED) 모바일쿠폰` -> `G00001810964`
- Kept the structure ready for a future lower-priced catalog item such as a `1500P` Compose coffee coupon.
- Added upload-ready artifacts:
  - `tasks/reward_catalog_seed_2026-04-26.json`
  - `tasks/reward_market_live_env_blocks_2026-04-26.md`
- Verification:
  - `node -c functions/reward-market.js`
  - `npm test`
  - `npx esbuild js/reward-market.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\reward-market-check.js`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
  - `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`
