# 2026-04-20 Runtime Regression Fix v163

## Goal

- [x] Reproduce the severe runtime error reported on production after `v163`
- [x] Fix the initialization-order crash around `_stepData`
- [x] Fix the assets-tab `updateAssetDisplay` direct call regression
- [ ] Verify with tests and bundle check
- [ ] Deploy the hotfix to staging and production

## Plan

- [x] Inspect production console traces and map them to source locations
- [x] Move shared step state initialization ahead of diet-program refresh hooks
- [x] Replace unsafe direct asset refresh invocation with the window-bound version
- [x] Add a regression test that guards source ordering and safe asset refresh usage
- [ ] Run `npm test`, `npx esbuild ...`, and `node --check functions/index.js`
- [ ] Commit/push and deploy after verification

## Review

- The crash came from `window.applyDietProgramUserData()` calling `updateRecordFlowGuides()` before `_stepData` had been initialized, which triggered TDZ access in `_getExerciseGuideCounts()`.
- A second regression came from `openTab('assets')` calling `updateAssetDisplay()` before the `window.updateAssetDisplay` assignment was guaranteed to exist.
- The fix initializes `_stepData` at the top-level import section and routes the assets refresh through `window.updateAssetDisplay?.()`.
- A static regression test now enforces both ordering and the safe assets-tab refresh call.
