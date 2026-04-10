# 2026-04-07 diet ai analysis persistence fix

## Goal
- Fix the diet AI analysis flow so pressing save persists the analysis across refresh.
- Keep the meal tab button state as `분석 확인` after reload when analysis exists.
- Restore the gallery overlay CTA when a saved diet analysis is present.

## Plan
- [x] Inspect the diet AI analysis request/save/restore flow in the dashboard and gallery.
- [x] Fix the root cause in the saved payload or restore logic so analysis persists after reload.
- [x] Run project verification and summarize any remaining risk.

## Notes
- User report: analysis is generated, save is pressed, but after refresh the meal tab falls back to `AI 분석` and the gallery entry loses `분석 확인`.

## Review
- The save flow now reads diet and sleep AI analysis from the current UI state instead of reusing stale `oldData`.
- Analysis saves also refresh the in-memory daily log cache so a later manual save cannot overwrite the freshly generated result.
- Verification:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js`
