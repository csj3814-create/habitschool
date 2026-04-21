# 2026-04-21 Production Diet Program Rules Drift

## Plan
- [x] Review lessons and inspect the diet-method save flow plus Firestore rules
- [x] Verify whether the production Firestore release includes the `programPreferences` rules needed by the diet program feature
- [x] Record the root cause and the needed remediation

## Notes
- User reported `식단 방법 저장 중 문제가 생겼어요.` on `https://habitschool.web.app/#profile`.
- The save flow in `js/app-core.js` writes `users/{uid}.programPreferences.diet`.
- Local `firestore.rules` allows `programPreferences` and validates `diet.methodId`, `remindersEnabled`, `activatedAt`, and `fastingPreset`.
- Live Firestore Rules API confirmed:
  - production release `projects/habitschool-8497b/releases/cloud.firestore` last updated at `2026-04-07T23:14:36.705989Z`
  - staging release `projects/habitschool-staging/releases/cloud.firestore` last updated at `2026-04-20T10:46:31.497082Z`
- Production ruleset content does not contain the `programPreferences` allowlist entry, so owner writes to that field are denied.

## Review
- Root cause is deployment drift, not a new frontend code bug.
- Required remediation: deploy `firestore.rules` to production so the live rules match the already-shipped diet-program write path.
