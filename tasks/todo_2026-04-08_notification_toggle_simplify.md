# 2026-04-08 notification toggle simplify

## Goal
- Simplify the notification card so enabling push feels like one clear action.
- Let users turn Habitschool push off again with one tap after permission is granted.
- Remove the long blocked-permission popup and keep denied guidance short inside the card.

## Plan
- [x] Review the current notification permission card state logic and token lifecycle.
- [x] Add a simple app-level push on/off flow on top of the browser permission model.
- [x] Verify with bundle/test checks and document the UX lesson.

## Review
- Split the notification card into browser permission state and Habitschool push connection state so the button can behave like a real on/off toggle after permission is granted.
- Added one-tap `알림 켜기` and one-tap `알림 끄기` flows by linking and unlinking the current device token instead of only describing the browser permission state.
- Removed the long blocked-permission alert and replaced it with a short in-card explanation for denied browser permissions.
- Verified with `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js` and `npm test`.
