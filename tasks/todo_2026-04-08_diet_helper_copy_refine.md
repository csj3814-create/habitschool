# 2026-04-08 Diet Helper Copy Refine

## Goal

- [x] Remove awkward fasting-metric count wording from the diet-tab save helper
- [x] Keep the bottom save-bar helper natural on mobile
- [x] Verify the web bundle before deployment

## Plan

- [x] Inspect the current diet helper and nearby status copy
- [x] Replace count-heavy fasting wording with a simpler fasting-metric label
- [x] Update lessons after the user correction and run the standard web checks

## Review

- The diet save helper no longer exposes fasting field counts like `4 items` in user-facing copy.
- Combined-save guidance now refers to the fasting metric group instead of raw field counts.
- The fasting-only save state also uses a domain label instead of a numeric field count.

## Verification

- [x] `npm test`
- [x] `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
