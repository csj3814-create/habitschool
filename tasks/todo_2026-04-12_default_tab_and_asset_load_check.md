# 2026-04-12 Default Tab And Asset Load Check

## Goal
- Set the app's first screen back to `내 기록` instead of `프로필`.
- Confirm which asset-tab sections now load faster and whether any paths still wait on slow data.

## Plan
- [x] Inspect initial tab selection logic
- [x] Change the default tab to `내 기록`
- [x] Review asset-tab loading flow and summarize the current behavior
- [ ] Verify with tests and bundle checks

## Review
- Root cause: a pending Haebit Coach connect token could override the normal first-tab selection and force the signed-in shell to open `profile`.
- Fix: keep the signed-in first tab on the normal requested/default tab (`dashboard`) and let the chatbot connect modal open without hijacking the whole tab.
- Asset tab note: points/HBT headline cards already benefit from local cache and background refresh; the recent HBT history fix specifically improves the transaction-history box so Firestore-backed rows can render before slow onchain history arrives.

