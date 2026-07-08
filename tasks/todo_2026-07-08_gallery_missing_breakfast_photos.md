# 2026-07-08 Gallery missing breakfast photos

## Report
- Gallery shows some July 8 diet posts with a broken/empty breakfast image.
- The card still exists, shows diet points and an analysis button, but the photo itself is missing from the rendered gallery.

## Plan
- [x] Inspect gallery rendering and diet save data shape for breakfast images.
- [x] Check whether affected production daily logs contain missing, invalid, local, or inaccessible image URLs.
- [x] Identify the save/rendering path that can produce a visible broken gallery image.
- [x] Patch the root cause or add a safe recovery path.
- [x] Add focused regression tests and run required verification.

## Review
- Production July 8 data showed two broken breakfast patterns:
  - `YvB2nnvJR0UMracYTa3ByCmubKt2_2026-07-08`: `breakfastUrl` exists but is `image/heic` with no thumbnail, so Android/Chrome cannot render it.
  - `IIEVtmgly0VlsOUv6PcEbPmOMrA2_2026-07-08`: `breakfastUrl` exists but the Storage object reports `image/jpeg` with `content-length: 0`.
- Root cause: save/award/gallery paths treated any persisted Storage URL as valid media, even if the selected file was empty or the stored original was not gallery-compatible.
- Fix: block zero-byte uploads, reject HEIC/HEIF originals that cannot be converted to a gallery-compatible image, verify Storage metadata size before returning a URL, and replace final gallery image errors with an in-app placeholder instead of a broken browser image.
- Version: bumped runtime cache from `v225` to `v226`.
- Verification:
  - `npx vitest run tests/diet-photo-persistence.test.js tests/video-upload-resilience.test.js tests/upload-performance.test.js tests/pwa-versioning.test.js`
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js`
  - `npm run check:en`
  - `git diff --check`
