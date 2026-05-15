# Samsung Internet photo picker v179

## Checklist
- [x] Re-enable `showOpenFilePicker()` as the first library picker on Samsung Internet/Android.
- [x] Show an explicit retry/fallback panel after picker permission denial or API failure instead of auto-clicking a fallback input.
- [x] Keep camera upload and camera-return auth protection unchanged.
- [x] Add stalled 0% upload copy and make save/offline paths keep selected files without URLs.
- [x] Rotate runtime assets to v179.
- [x] Run `npm test`, esbuild bundle check, and `node --check sw.js`.

## Review
- `npm test`: passed, 41 files / 289 tests.
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`: passed.
- `node --check sw.js`: passed.
- First test run caught stale `styles.css` v178 imports; fixed by aligning the CSS entry imports to v179.
