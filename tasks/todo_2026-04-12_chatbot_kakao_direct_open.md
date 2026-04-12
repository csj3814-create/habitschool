# 2026-04-12 Chatbot Kakao Direct Open

## Goal
- Make the Haebit Coach connection card open the Kakao 1:1 chat directly from the first step box.
- Restyle the first-step CTA with a Kakao-like yellow emphasis so the action is obvious.

## Plan
- [x] Inspect the existing chatbot link card markup and Kakao channel URL source
- [x] Turn the first step into a direct-open CTA and apply Kakao styling
- [x] Verify with tests and bundle checks

## Review
- The first `카카오톡 1:1 채팅` step now opens the direct Haebit Coach Kakao chat URL instead of acting like passive copy.
- The CTA uses the same Kakao direct chat URL already configured in the chatbot project (`https://pf.kakao.com/_QDZZX/chat`) to avoid drift between the app and chatbot guidance.
- Verification:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
  - `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`
