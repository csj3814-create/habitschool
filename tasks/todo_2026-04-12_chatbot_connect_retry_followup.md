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
- Root cause: there were two layers. First, the pending chatbot-connect flow could cool down into a passive "보류" state after one transient failure. More importantly, the app hosting CSP `connect-src` header did not include `https://habitchatbot.onrender.com`, so the browser could block the Haebit Coach API fetch entirely.
- Fix: keep the pending token, schedule a few automatic follow-up retries, and add `https://habitchatbot.onrender.com` to the hosting CSP `connect-src` allowlist. Cache version was already bumped in the same series.
