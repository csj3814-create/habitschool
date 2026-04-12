# 2026-04-12 Closeout Docs and Changelog

## Goal

- Close out today's work with one readable internal summary.
- Update the public changelog so users can understand the main improvements from the day.
- Leave a clean next-start point for the next session.

## Plan

- [x] Review today's shipped changes across mainnet cutover polish, wallet stability, media upload flow, and Haebit Coach linking
- [x] Add a new public changelog entry for the user-facing improvements
- [x] Write an internal closeout note with outcomes and remaining follow-up items
- [ ] Final review of changed docs

## Summary

### Mainnet and Wallet
- Mainnet cutover follow-up stabilized the wallet copy, HBT history loading, active-chain links, halving table alignment, and asset-card recovery behavior.
- HBT transaction history now merges app-authored events with onchain transfer history more reliably, and the wallet UI stages the render instead of blocking on the slowest source.

### Media Upload and Gallery
- Media save flow now keeps existing same-day photos and videos unless the user explicitly removes them.
- Background upload state stays visible after save, and each pending file now shows upload progress in the UI.
- Gallery hydration was adjusted so a newly saved record shows up faster instead of falling back to an empty state.

### Haebit Coach Linking
- Kakao 1:1 chat can now be opened directly from the link card.
- Browser handoff and retry behavior were tightened up, and the app now preserves a successful `!연결` state even if the next Firestore read lags behind.
- When Kakao does not provide a nickname, the UI now uses a safer fallback label instead of a generic or broken-looking placeholder.

## Public Changelog

- Added `v1.0.6` to [changelog.html](C:/SJ/antigravity/habitschool/changelog.html)
- Focused the entry on:
  - wallet/HBT history stability
  - asset-card recovery
  - media upload progress and persistence
  - Haebit Coach connect flow and Kakao label cleanup

## Remaining Follow-up

- True Instagram-style upload continuation after refresh/app close is still not implemented; current behavior supports background upload while the page stays alive.
- Haebit Coach Kakao display names still depend on what the chatbot server can provide. The app-side fallback is now cleaner, but chatbot-side naming quality can still improve separately.
