# 2026-04-12 Chatbot Connect Identity Status

## Goal
- Make the `!연결` modal show a safe, human-readable Kakao account label.
- Stop the profile card from claiming there is no recent connect history when `!연결` already completed.

## Plan
- [x] Inspect how the app derives Kakao display labels and recent connect history
- [x] Persist `!연결` completion metadata on the user document and render it separately from registration-code history
- [ ] Verify with tests and bundle checks

## Review
- Root cause: the modal used the chatbot token's `displayName` verbatim, and that token falls back to a generic `사용자` label when Kakao nickname data is unavailable. Separately, the profile card only read `chatbotLinkCodeLastUsedAt`, which belongs to the old registration-code flow, so a successful `!연결` still looked like “최근 연결 이력은 아직 없어요.”
- Fix: treat generic Kakao labels as unnamed in the modal, persist `chatbotConnectLastLinkedAt` and `chatbotConnectLastKakaoDisplayName` on successful `!연결`, and render recent `!연결` history separately from registration-code usage.
