# 2026-04-07 github pages nojekyll fix

## Goal
- Keep GitHub Pages enabled.
- Stop GitHub Pages from running Jekyll over internal markdown and task files.
- Prevent repeated Pages failure emails on every push to `main`.

## Plan
- [x] Confirm the current Pages source/build mode and choose the lowest-risk fix.
- [x] Add a repository-level Pages setting file so the site is served as static files without Jekyll processing.
- [x] Verify locally, push to `main`, and confirm the next Pages run behavior.

## Review
- Confirmed GitHub Pages was still enabled in `legacy` mode from `main` `/`, which caused Jekyll to render internal markdown files on every push.
- Added a root `.nojekyll` file so Pages serves the repository as a static site and skips Jekyll markdown conversion.
- Verified local project checks with `npm test` and `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`.
- Pushed commit `3d6d625` and confirmed the next Pages workflow run `24087152323` completed successfully.
