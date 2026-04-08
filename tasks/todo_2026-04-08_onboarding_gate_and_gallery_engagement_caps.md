# 2026-04-08 onboarding gate and gallery engagement caps

## Goal
- Stop the welcome/onboarding modal from reappearing just because the Android APK was installed.
- Add anti-abuse point-award rules so gallery likes and comments only count once per user per post.

## Plan
- [x] Inspect how the onboarding modal decides a user is "new" and whether APK/PWA entry state is incorrectly involved.
- [x] Inspect gallery like/comment writes and the point-award path in web and Cloud Functions.
- [x] Implement onboarding gating for true first-signup state only and engagement caps of one qualifying like and one qualifying comment per user per post.
- [x] Run `npm test`, `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`, and any targeted function checks needed by the changed path.

## Review
- The welcome modal had been keyed only off `users.onboardingComplete`, so an existing account with that field missing could see signup onboarding again after installing the APK.
- The fix now records a short-lived “fresh signup happened in this session” marker only when `signInWithPopup()` returns `additionalUserInfo.isNewUser === true`, and `checkOnboarding()` shows the modal only for that case.
- Existing users who never had `onboardingComplete` are silently backfilled to `true` instead of seeing the signup reward modal again.
- Gallery engagement scoring now treats each post as at most one qualifying reaction and one qualifying comment per user:
  - Cloud Function reaction coins are awarded only for the first reaction a user leaves on a post, regardless of reaction type changes.
  - Weekly spotlight and backend community/monthly ranking stats now count unique commenters and unique reactors per post instead of raw comment count or per-type reaction count.
- Verification:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
  - `node --check functions/index.js`
