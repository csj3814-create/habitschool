# 2026-04-12 HaebitCoach Connect Handoff

## Goal

- Prevent the Haebit Coach account connect flow from losing pending connection info when the user moves from KakaoTalk's in-app browser into the external browser or app.

## Plan

- [x] Inspect the account connect flow, storage keys, and restore logic
- [x] Identify why pending connect info is unavailable after the browser handoff
- [x] Implement a robust recovery path across browser boundaries
- [x] Verify with tests and bundle checks

## Review

- Findings:
  - The browser handoff itself already preserves the current URL, including `chatbotConnectToken`, when opening the external browser.
  - The weaker point was the Haebit Coach token lookup/complete flow: one transient failure from the chatbot server immediately dropped the app into a pending-error state.
- Fix:
  - Added timeout + retry handling for chatbot token lookup and completion requests.
  - Broadened transient error classification to include timeout/rate-limit style responses.
  - Updated the pending notice copy so it explains that browser handoff can take a few more seconds instead of implying the token was simply lost.
- Verification:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
  - `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`
