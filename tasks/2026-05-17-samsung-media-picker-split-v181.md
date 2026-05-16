# Samsung Internet media picker split v181

## Checklist
- [x] Use Samsung Internet system picker for diet photos, exercise images, and sleep screenshots with image-only filters.
- [x] Use Samsung Internet system picker for exercise videos with video-only filters.
- [x] Preserve Chrome and non-Samsung browsers on their existing native input paths.
- [x] Keep camera capture, auth recovery, and upload persistence behavior unchanged.
- [x] Rotate runtime assets to v181.
- [x] Run `npm test`, esbuild bundle check, and `node --check sw.js`.

## Review
- `npm test`: passed, 41 files / 290 tests.
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`: passed.
- `node --check sw.js`: passed.
- Samsung Internet image flows now use an image-only system picker for diet photos, exercise images, and sleep screenshots.
- Samsung Internet exercise video flow now uses a video-only system picker.
- Chrome and non-Samsung browsers continue to use the existing native input path.
