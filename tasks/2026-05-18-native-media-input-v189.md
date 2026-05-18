# Native media input v189

- [x] Remove standards/system picker API paths from app media selection.
- [x] Route diet library photos through the native file input path.
- [x] Route exercise images, exercise videos, and sleep captures through the native file input path.
- [x] Keep camera capture as the only `capture="environment"` path.
- [x] Remove `showOpenFilePicker()` from runtime app source.
- [x] Update source guards/tests for the simpler native-input contract.
- [x] Rotate runtime assets to v189.
- [x] Run `npm test`.
- [x] Run `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`.
- [x] Run `node --check sw.js`.
- [ ] Deploy staging and verify v189 is served.

## Notes

- The user explicitly corrected the direction: both photos and videos should use native file inputs instead of continuing to tune `showOpenFilePicker()` behavior.
- The implementation now avoids browser picker APIs for media selection entirely and keeps one input-click path per media kind.

## Review

- `npm test`: passed, 41 files / 293 tests.
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`: passed.
- `node --check sw.js`: passed.
- Runtime source scan confirmed no `showOpenFilePicker`, Samsung system picker helpers, or `_habitschoolPickedFile` paths remain under `index.html`, `sw.js`, `styles.css`, or `js/`.
