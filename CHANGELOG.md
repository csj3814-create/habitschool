# Changelog

All notable changes to Habitschool are documented here.

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
