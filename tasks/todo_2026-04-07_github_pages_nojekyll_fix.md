# 2026-04-07 github pages nojekyll fix

## Goal
- Keep GitHub Pages enabled.
- Stop GitHub Pages from running Jekyll over internal markdown and task files.
- Prevent repeated Pages failure emails on every push to `main`.

## Plan
- [ ] Confirm the current Pages source/build mode and choose the lowest-risk fix.
- [ ] Add a repository-level Pages setting file so the site is served as static files without Jekyll processing.
- [ ] Verify locally, push to `main`, and confirm the next Pages run behavior.
