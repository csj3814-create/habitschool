# 2026-04-14 Dashboard Selected Date Sync

## Checklist
- [x] Review relevant lessons for dashboard/date-state regressions
- [x] Inspect the selected-date change path and dashboard hero render path
- [x] Make the `하나씩 기록` / dashboard hero respect the selected date
- [x] Keep dashboard cache behavior coherent after the date-sync fix
- [x] Verify with tests and bundle checks

## Findings
- The selected date picker calls `loadDataForSelectedDate(date)` and updates the record form, but it does not make the dashboard hero recompute against that selected date.
- `renderDashboard()` and `_renderDashboardWithData()` are anchored to `getDatesInfo().todayStr`, so the hero pill/title/action state always use today's log unless the selected date happens to be the same as today.
- Dashboard cache reuse is keyed only by user, which hides date-sensitive rendering bugs and makes future selected-week changes risky.

## Plan
- Introduce a dashboard reference-date helper that resolves the currently selected date safely.
- Re-render the dashboard when the selected date changes and the dashboard tab is visible.
- Use the selected date's awarded points for the hero/action-strip state, with cached daily-log fallback when the selected date is outside the currently fetched week.
- Make dashboard cache entries week-aware so different selected weeks cannot reuse the wrong snapshot.

## Review
- `loadDataForSelectedDate()` now re-renders the dashboard when the dashboard tab is visible, so the hero refreshes after the selected document cache updates.
- The hero no longer trusts only `todayStr`; it first resolves the selected date and then reads that day's cached `awardedPoints`, falling back to the current-week snapshot only when needed.
- Verification:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
  - `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`
