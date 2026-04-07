# 2026-04-08 auth text encoding fix

## Goal
- Fix mojibake text shown from auth-related alerts and toasts.
- Restore user-facing Korean strings in `js/auth.js` without changing the auth logic.

## Plan
- [x] Identify user-visible garbled strings in `js/auth.js`.
- [x] Replace broken alert, toast, confirm, and label text with valid Korean strings.
- [x] Run bundle and test verification, then document the lesson.

## Review
- Confirmed the staging popup was not a foreign language but mojibake caused by broken Korean strings in `js/auth.js`.
- Restored user-facing invite-link, login, delete-account, and push-permission messages to valid Korean text.
- Verified with `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js` and `npm test`.
