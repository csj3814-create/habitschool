# 2026-04-14 Closeout Cleanup

## Checklist
- [x] Pick up and commit the lingering migration payout note from 2026-04-13
- [x] Keep 2026-04-14 task notes in the repo for the date-sync, retroactive point cutoff, and media-date policy changes
- [x] Re-verify the working tree after documentation cleanup
- [x] Re-sync staging after the final closeout commit

## Included Work
- Dashboard selected-date sync in the `하나씩 기록` / dashboard hero
- Retroactive point cutoff:
  - yesterday still awards points
  - 2+ day old logs save without new points
  - CTA warning and button copy aligned with that rule
- Media-date policy refinement:
  - EXIF-present photos are strict
  - EXIF-missing photos and videos warn, then allow exception
- Gallery hero guide toggle copy simplified to `펼치기` / `접기`
- Documentation cleanup for the lingering Seokjae migration mint note

## Verification
- `git status --short`
- staging deploy after the final closeout commit

## Review
- Session-close cleanup matters because task notes are part of the working agreement in this repo, even if they do not affect production code directly.
- A clean worktree at the end of the day prevents the next deployment from looking incomplete or confusing.
