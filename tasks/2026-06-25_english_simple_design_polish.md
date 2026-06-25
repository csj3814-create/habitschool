# 2026-06-25 English simple design polish

## Checklist
- [x] Tune English simple CTA colors and card density
- [x] Improve upload, AI, and remove button visual hierarchy
- [x] Verify local `/en` styles and console errors
- [x] Run required checks

## Review
- Warmed English simple cards, active tab, upload zones, and CTA hierarchy.
- Added v216 asset cache bust so deployed CSS refreshes cleanly.
- Checks passed: `npm test`, `npm run check:en`, esbuild bundle, `git diff --check`.
