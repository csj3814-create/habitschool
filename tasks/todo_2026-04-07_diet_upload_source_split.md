# 2026-04-07 diet upload source split

## Goal
- Split the diet tab top upload CTA into two choices: camera capture and library selection.
- Reuse the existing diet slot upload flow without changing per-slot upload boxes.

## Plan
- [x] Inspect the current top CTA and next-empty-slot upload helper.
- [x] Replace the single CTA with two source-specific buttons and wire them to the next empty diet slot.
- [x] Run project verification and summarize any browser caveat.

## Notes
- The user wants the split only for the top diet CTA, not for every diet slot input.

## Review
- Replaced the single diet upload CTA tap target with `카메라로 촬영` and `보관함에서 선택` buttons.
- Reused the next-empty-slot helper by routing both buttons through a temporary `capture="environment"` toggle for camera capture.
- Scoped the split layout to the diet tab's top CTA so shared upload cards in other tabs keep their original arrow-based layout.
- Verified with `npm test` and `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`.
- Browser behavior still depends on the device and browser because `capture` is a hint, not a guaranteed native camera-only flow.
