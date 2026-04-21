# 2026-04-21 Galaxy Login Bounce Investigation

## Plan
- [x] Inspect current mobile Google sign-in flow, redirect/popup branching, and auth-state listener behavior.
- [x] Compare recent auth-related changes for regressions that could bounce Galaxy users back to the login screen.
- [x] Implement and verify a fix if a recent update introduced the issue.

## Review
- The issue path is the Samsung Internet redirect-login recovery flow, not the recent diet-program UI changes.
- The friend-referral QR path is not the direct sign-out cause. `processReferralSignup` only runs after Firebase Auth is already restored because the callable requires `request.auth.uid`.
- New/referral signups can expose the problem more often because first-login user creation, referral linking, and onboarding setup make the redirect-return gap feel longer on Galaxy devices.
- `handleGoogleRedirectLoginResult()` was clearing pending redirect state too early, and the logged-out branch could repaint the Google login screen before redirect auth had fully restored.
- Added a short redirect-recovery grace window, a pending-login UI state, and delayed reset logic so Galaxy users are not bounced back to the login screen during the redirect return gap.
- Verified with `npm test`, `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`, and `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`.
