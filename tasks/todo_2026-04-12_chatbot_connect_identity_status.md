# 2026-04-12 Chatbot Connect Identity Status

## Goal
- Make the `!연결` modal show a safe, human-readable Kakao account label.
- Keep the profile card from claiming there is no recent connect history after a successful `!연결`.

## Plan
- [x] Inspect how the app derives Kakao display labels and recent connect history
- [x] Persist `!연결` completion metadata on the user document and render it separately from registration-code history
- [x] Prevent stale user-doc reloads from overwriting freshly completed `!연결` state
- [ ] Verify with tests and bundle checks

## Review
- Root cause 1: the profile card only looked correct if the fresh `chatbotConnectLastLinkedAt` write was immediately visible in the next Firestore read. When the follow-up read lagged or returned older data, the optimistic success state got overwritten and the card fell back to `최근 !연결 / 등록 코드 이력은 아직 없어요.`
- Root cause 2: when Kakao does not provide a real nickname, the modal row fell back to a cold placeholder (`표시 이름 미확인`) instead of a friendlier label for the current 1:1 account.
- Fix: render the optimistic `!연결` completion state immediately, re-read the user doc from the server when possible, merge any fresher optimistic timestamps back into the loaded status, and soften the modal fallback label to `현재 카카오 1:1 계정`.
