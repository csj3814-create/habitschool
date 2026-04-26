# 2026-04-27 Reward Market Phone Collapsed View

## Checklist
- [x] Split the saved contact panel into a collapsed summary state and an edit state.
- [x] Show only the masked saved number and a `수정` button once a valid phone number is stored.
- [x] Re-run reward-market UI verification after the interaction change.

## Notes
- Leaving the input expanded after save wastes vertical space on mobile.
- The saved recipient phone changes rarely, so the default state should favor compact review over editing.

## Review
- Saved recipient phones now render as a masked summary row with an explicit `수정` action.
- Refresh and re-login keep the panel collapsed when a valid saved number exists.
- `window.editRewardRecipientPhone()` reopens the editor and returns focus to the phone input.
- `npm test`, `npx esbuild js/reward-market.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\reward-market-check.js`, `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`, and `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js` all passed.
