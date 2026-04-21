# 2026-04-21 Welcome Bonus Investigation

## Plan
- [x] Review lessons and inspect signup welcome-bonus awarding logic plus admin/member point display paths
- [x] Check recent code/history around the suspected 15-day window and inspect affected user data if accessible
- [x] Summarize root cause and propose or implement a fix if needed

## Notes
- User suspects users who joined or were active around 2026-04-15 onward may have missed the 200P signup bonus.
- Need to distinguish between real bonus-award failures and admin UI/reporting misunderstandings.

## Findings
- Admin members table `date` is the user's latest log date, not signup date.
- Admin `현재 포인트` is current `users.coins`, not cumulative awarded points.
- Live Firestore spot checks show real welcome-bonus misses:
  - `sadie0853@gmail.com`: `createdAt` exists, `onboardingComplete=true`, `welcomeBonusGiven` missing, `coins=62`
- Live Firestore query results:
  - `2026-04-15` 이후 생성 사용자 44명 중 `welcomeBonusGiven=false` 44명
  - `2026-04-08`~`2026-04-14` 생성 사용자 32명 중 `welcomeBonusGiven=false` 31명
  - `2026-03-28`~`2026-04-07` 생성 사용자 14명 중 `welcomeBonusGiven=false` 0명
- Root cause:
  - `3294ced` changed onboarding display to depend on a sessionStorage `pending signup` marker.
  - That marker was set using `result.additionalUserInfo?.isNewUser`, which is not reliable in the current auth flow, so most new signups never opened onboarding and never called `awardWelcomeBonus`.

## Review
- Added tested helper logic for signup-pending parsing, new-user credential detection, onboarding fallback, and welcome-bonus auto-recovery.
- Updated auth flow to set pending signup onboarding using both sign-in result detection and Firestore first-doc creation fallback.
- Updated onboarding check to:
  - still show onboarding for fresh post-launch signups even if the pending marker is missing
  - auto-grant the missing welcome bonus for recently affected users whose `onboardingComplete=true` but `welcomeBonusGiven` is still false
