# Changelog

All notable changes to Habitschool are documented here.

## 2026-07-10

### Security
- Blocked client-forged coin minting via `daily_logs.awardedPoints`: `firestore.rules` now whitelists/caps `awardedPoints` (diet 30 / exercise 30 / mind 20) and the `awardPoints` trigger clamps the credited diff server-side (`functions/points-utils.js`).
- Made reactions server-authoritative to stop reaction-based coin minting: any signed-in user could previously write arbitrary UIDs into `daily_logs.reactions` and mint coins for the post owner (and inflate MVP score). New `toggleReactionOnPost` callable toggles/awards with the verified `request.auth.uid` only; `firestore.rules` now bars client writes to `reactions`/`reactionPointAwardedUserIds`. Replaces the `awardReactionPoints` trigger.
- Made `claimChallengeReward` atomic with a per-user/tier claim lock (`create()` mutual exclusion) to prevent concurrent double-claim of reward points / bonus HBT during on-chain settlement.
- Made the `mintHBT` lock atomic (`create()` instead of get-then-set) to prevent concurrent double-deduct / double-mint.
- Enforced `shareSettings` server-side: `daily_logs` stays gallery-public, but hidden fields (userName, gratitude) are stripped from the public doc and the gratitude original is kept in an owner-only `daily_logs/{id}/private/mind` subdocument. (Default sharing remains public by product decision.)

### Changed
- Extracted the challenge settlement/qualification math into `functions/challenge-utils.js` (single source of truth) with behavioral tests — previously untested inline logic in `runtime.js`, the top recurring-bug area.
- Extracted pure friendship predicates into `js/friendship-utils.js` as the first safe step of splitting the 1MB `app-core.js` monolith.

### Fixed
- Suppressed stale in-app notification toasts: notifications older than 30 minutes are now silently marked seen instead of popping up late when the app is reopened (applies to all notification types, not just `friend_connected`).
- Fixed the admin member table's "발송됨" feedback badge breaking on apostrophes: replaced onclick interpolation with `data-*` attributes and a delegated click listener.

### Chore
- Removed tracked scratch file `temp_cmd.txt` and the byte-identical duplicate `HBT_TOKENOMICS.txt`; ran `git gc` (loose objects ~61 MiB → packed ~7.7 MiB).

### Verification
- `npm test` (409 passing, incl. new `points-utils`, `challenge-utils`, `friendship-utils` suites)
- `npx esbuild js/app-core.js --bundle --external:https://* --format=esm` (client bundle parse check)
- `node -c functions/runtime.js` (server syntax check)

### Deployment
- Production (`https://habitschool.web.app`, PWA v226): security hardening + notification fix — commits `d5c9978` → `0b5ae5b`.
- Pending deployment (committed, staged for staging→prod): settlement extraction `bfbadad`, friendship extraction `6d60ec2`, admin badge fix `9ded33d`. Note: the next production deploy must bump the PWA version past v226.

## 2026-06-25

### Changed
- Added the English `/en` simple app entry and polished its signed-in design hierarchy.
- Updated English simple app cards, upload zones, AI buttons, and CTAs to better match the Korean simple visual quality.
- Rotated PWA/assets through v216 so production clients receive the latest English styling.

### Fixed
- Fixed remaining Korean labels in the English Exercise and Mind simple flows.
- Updated meditation guide tests to cover the current English/Korean guide toggle copy.

### Verification
- `npm test`
- `npm run check:en`
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
- `git diff --check`

### Deployment
- Production: `https://habitschool.web.app/en`
- Latest production commit: `ecfccb3 Polish English simple app styling`

## 2026-06-04

### Added
- Added the exercise habit group pilot model with four group types:
  - 10,000-step walking
  - Home training proof room
  - Gym attendance
  - Running club
- Added per-group reward progress so users can join up to two exercise groups and progress each group independently.
- Added paid group entry support with a 200P entry fee and 3,000P reward target for 100 approved completions.
- Added leader review workflow for habit group checkins:
  - Group leaders can see pending submissions on the dashboard.
  - Leaders can approve or reject submitted records.
  - Reward progress advances only after approval.
- Added Firestore index support for leader review queues on `habit_group_checkins(groupId, reviewStatus)`.
- Added production deployment of habit group callable/functions:
  - `joinHabitGroup`
  - `leaveHabitGroup`
  - `reviewHabitGroupCheckin`
  - `transferHabitGroupLeader`
  - `onHabitGroupCheckinWritten`
- Added a user-facing Korean changelog page refresh for the latest habit group and gallery entry updates.

### Changed
- Updated the gallery community CTA so users enter the Kakao OpenChat directly without account-linking friction.
- Increased habit group dashboard visibility to show up to four groups while keeping membership capped at two groups.
- Refined the joined group dashboard copy:
  - Removed repeated "today submitted / pending review" copy from compact group cards.
  - Kept progress copy concise with completion, approved, and pending counts.
- Collapsed unavailable recommendations by default when a user is already in two groups.
- Replaced repeated "2 groups joined" labels with a single "maximum 2 groups" section-level control.
- Sorted recommended exercise groups by participant count.
- Rotated PWA assets through v208 to ensure mobile/PWA clients pick up the latest runtime.

### Fixed
- Fixed mojibake in `changelog.html`, where Korean release notes were rendered as question-mark placeholder text.
- Fixed same-day group reward progress so two joined groups can each count on the same date when both conditions are met.
- Fixed duplicate checkin counting within the same group and date by keeping progress scoped to `user + groupId`.
- Fixed Samsung Internet exercise video uploads that could remain stuck around 1% by using the safer upload path for exercise videos.
- Fixed leader review media rendering:
  - Photos now open in the existing gallery lightbox.
  - Videos now render as playable video only when a real video URL is available.
  - Older pending checkins are hydrated from the related daily log when the original video URL was missing from the checkin snapshot.
  - Thumbnail-only records no longer pass image URLs into a `<video>` source.
- Fixed date rollover behavior so returning after a new day reloads the selected date more reliably.

### Verification
- `npm test`
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
- Focused habit group and PWA versioning Vitest suites
- `node --check functions/runtime.js`
- `git diff --check`

### Deployment
- Staging: `https://habitschool-staging.web.app`
- Production: `https://habitschool.web.app`
- Latest production commit: `6b0b080 Update habit group and gallery entry UI`
