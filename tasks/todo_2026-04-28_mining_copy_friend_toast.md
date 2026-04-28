# 2026-04-28 Mining Copy + Friend Toast

## Checklist

- [x] Remove the secondary `BSC Mainnet 기준` copy from the mining progress label.
- [x] Trace why `공감케어님과 연결되었어요` appears again after cache clear/login.
- [x] Persist friend-connection notification consumption in server-backed state, not only browser cache.
- [x] Add regression coverage for the repeat-toast path.
- [x] Run `npm test`.
- [x] Run the esbuild browser bundle check.

## Review

- `halving-progress-source-label` now stays as `구간 진행도`; the numeric HBT progress remains beside it.
- Root cause: notification dedupe was localStorage/session-only, so clearing browser cache made old `friend_connected` notification docs look new again.
- Fix: notification docs are marked with `clientSeenAt/clientSeenBy/clientSeenReason` before toast display, locally seen docs are backfilled silently, and stale `friend_connected` docs are consumed without a toast.
- Verification: `npm test` and esbuild browser bundle check passed.
