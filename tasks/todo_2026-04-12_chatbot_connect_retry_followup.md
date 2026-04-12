# 2026-04-12 Chatbot Connect Retry Follow-up

## Goal
- Make `!연결` recover more reliably after Kakao in-app to browser handoff.
- Avoid leaving users stuck in pending state after one transient failure.

## Plan
- [x] Inspect current retry and pending-token handling
- [x] Add resilient automatic follow-up retries for pending chatbot connect
- [x] Update notes and lessons
- [ ] Verify with tests and bundle checks

## Review
- Root cause: after one transient fetch failure, the pending chatbot-connect flow could cool down into a passive "보류" state and stop trying again unless the user manually pressed `다시 확인`.
- Fix: keep the pending token, schedule a few automatic follow-up retries, and clear those timers immediately on success, completion, or non-retryable failure. Cache version was bumped with the same change.
