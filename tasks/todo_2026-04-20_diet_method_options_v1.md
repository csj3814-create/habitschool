# 2026-04-20 Diet Method Options v1

## Goal

- [x] Add diet method selection UI and reminder-consent flow in profile
- [x] Personalize dashboard summary, record-flow guide text, and diet analysis tip by selected method
- [x] Add diet-method reminder schedules and filtering in Cloud Functions
- [x] Extend Firestore user rules for `programPreferences.diet`
- [x] Add helper tests and run required verification commands

## Plan

- [x] Create diet method catalog/helper logic for method order, normalization, IF timing, and copy generation
- [x] Wire profile selector modal, consent modal, reminder toggle, and local user-data refresh
- [x] Reuse notification permission flow with structured return values and expose readable push-state helper
- [x] Add backend reminder jobs for lunch, dinner, fasting start, and fasting close
- [x] Verify with `npm test`, `npx esbuild ...`, and `node --check functions/index.js`

## Review

- Added diet method preference handling around `users/{uid}.programPreferences.diet`
- Added profile method selector, consent modal, reminder toggle, and dashboard method summary
- Personalized diet guide copy and appended static diet-method tips under AI diet analysis results
- Added backend schedulers that only notify users with `remindersEnabled=true` and a still-empty relevant meal slot
- Follow-up: shortened the selector/profile copy and reduced selector cards to a single main line plus caution text
- Follow-up: hardened diet-method persistence so Firestore save and local UI sync fail independently, and relaxed `programPreferences` rule validation to avoid rejecting sibling preference keys
- Follow-up: changed the consent modal to a short `네 / 아니오` choice and made `네` save `remindersEnabled=true` immediately before continuing the device-level notification setup flow
- Verification completed:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
  - `node --check functions/index.js`
  - `node --check functions/runtime.js`
