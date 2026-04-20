# 2026-04-20 Runtime Regression Fix v165

## Goal

- [x] Reproduce the severe runtime error reported on production after `v163`
- [x] Fix the initialization-order crash around `_stepData`
- [x] Fix the assets-tab `updateAssetDisplay` direct call regression
- [x] Fix the follow-on initialization-order crashes around `_dashboardCache` and `galleryUserFilter`
- [x] Verify with tests and bundle check
- [ ] Deploy the hotfix to staging and production

## Plan

- [x] Inspect production console traces and map them to source locations
- [x] Replace unsafe direct asset refresh invocation with the window-bound version
- [x] Add a regression test that guards boot-time queueing and safe asset refresh usage
- [x] Queue early `openTab()` / `applyDietProgramUserData()` calls until module bootstrap completes
- [x] Run `npm test`, `npx esbuild ...`, and `node --check functions/index.js`
- [ ] Commit/push and deploy after verification

## Review

- The crash came from `window.applyDietProgramUserData()` calling `updateRecordFlowGuides()` before `_stepData` had been initialized, which triggered TDZ access in `_getExerciseGuideCounts()`.
- A second regression came from `openTab('assets')` calling `updateAssetDisplay()` before the `window.updateAssetDisplay` assignment was guaranteed to exist.
- A third regression showed that auth-time `openTab()` and diet-program sync hooks could still run before later shared state like `_dashboardCache` and `galleryUserFilter` had initialized.
- The final fix keeps `window.updateAssetDisplay?.()` for the assets refresh, removes the eager diet-program bootstrap call, and queues both `openTab()` and `window.applyDietProgramUserData()` until the module has fully evaluated.
- A static regression test now enforces the boot-queue guard and the safe assets-tab refresh call.
