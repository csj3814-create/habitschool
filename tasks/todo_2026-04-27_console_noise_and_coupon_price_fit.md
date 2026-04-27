# 2026-04-27 Console Noise and Coupon Price Fit

## Goal
- Keep transient Firestore reconnect noise from looking like hard app failures in production/staging DevTools.
- Make reward coupon price rows fit in the narrow PC two-column cards.

## Checklist
- [x] Inspect Firestore SDK/app console log points.
- [x] Silence Firestore SDK internal WebChannel logs outside local development.
- [x] Lower optional Firestore reconnect/timeout app logs to `console.info`.
- [x] Compact reward-market price chip UI.
- [x] Update regression tests.
- [x] Run `npm test` and esbuild verification.

## Review
- Firestore SDK log level is now `silent` for staging/production while local development keeps normal SDK logs.
- Optional friendship, metabolic score, onboarding, and wallet Firestore reconnect paths now log as deferred info instead of warning/error when the issue is connectivity.
- Coupon cards now show compact visual pricing (`2,000P · 2,000원`) and keep the full label in `aria-label`.
- Verification passed: focused tests, full `npm test`, and app esbuild bundle.
