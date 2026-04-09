# 2026-04-10 Wallet Tokenomics Copy Alignment

## Plan
- [x] Confirm the real runtime HBT daily cap and affected copy locations
- [x] Update wallet and tokenomics copy to use the current 12,000 HBT cap
- [x] Remove `신규` from user-facing weekly/master challenge wording
- [x] Run verification
- [x] Update lessons and summarize

## Notes
- Runtime source of truth is `MAX_DAILY_HBT = 12000` in `functions/index.js`, and wallet UI refresh logic also uses `12000` in `js/app.js`.
- User-facing fallback HTML and tokenomics copy were still showing `5,000 HBT` and `신규 위클리/마스터`.

## Review
- Runtime source of truth remains `MAX_DAILY_HBT = 12000` in `functions/index.js` and `dailyMax = 12000` in `js/app.js`.
- Updated user-facing copy in `index.html`, `tokenomics.html`, `HBT_TOKENOMICS.md`, and `HBT_TOKENOMICS.txt`.
- Verified with `npm test` and `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`.
