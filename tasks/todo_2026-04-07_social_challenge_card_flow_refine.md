# 2026-04-07 social challenge card flow refine

## Goal
- Simplify the friend challenge helper copy in the dashboard card.
- Let a ready friend row act as a direct `챌린지 시작` action with that friend preselected.
- Show `수락 대기중` on the same row when an invite is already pending, and allow cancelling that pending invite.

## Plan
- [x] Inspect the readiness row rendering, challenge start modal, and pending invite handling.
- [x] Update the dashboard card UI and action flow in `js/app.js` and any needed styles.
- [x] Run `npm test` and the esbuild bundle check.
- [x] Summarize the change and note any follow-up deployment step if needed.

## Notes
- Requested behavior is for the prod dashboard friend challenge card.
- Keep the change narrow to the social challenge dashboard flow.
- `js/app.js`
  - Removed the extra helper sentence under `바로 챌린지 가능한 친구가 있어요`.
  - Ready friend rows now render `챌린지 시작` and open the same create modal with that friend preselected.
  - Pending/outgoing challenge rows now render `수락 대기중` plus `취소`.
  - Pending outgoing rows in the open challenge list also expose `취소`.
- `functions/index.js`
  - Added `cancelSocialChallenge` callable so the challenge creator can cancel a pending invite and recover staked points for competition challenges.
- `styles.css`
  - Added row action / pending / inline cancel button styles for the challenge card.
- Verification:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js`
  - `node --check functions/index.js`

## Review
- Dashboard friend challenge copy and CTA flow are aligned with the requested behavior.
- This change includes a new callable function, so production use requires a `hosting,functions` deploy after commit/push.

## Follow-up
- [x] Remove the duplicate row-level cancel button and keep cancel only on the lower challenge detail row.
- [x] Filter already busy friends out of the create modal and disable the challenge type that is already pending or active.
- [x] Allow one open `competition` plus one open `group_goal`, while blocking same-friend overlap on the server.
