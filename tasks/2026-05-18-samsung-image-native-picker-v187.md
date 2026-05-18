# Samsung Internet image native picker v187

- [x] Confirm that Samsung Internet diet photo selection currently tries the system picker before the working native fallback.
- [x] Route Samsung Internet image library uploads directly to the native file input path.
- [x] Keep camera capture unchanged.
- [x] Keep Samsung exercise video system picker as the first video path.
- [x] Accept Samsung exercise video picker files with generic/empty MIME metadata.
- [x] Use a retry/fallback message instead of "no video selected" when a selected video cannot be applied.
- [x] Treat exercise video folder uploads as video uploads for size, timeout, and Storage content type.
- [x] Rotate runtime assets to v187.
- [x] Update source guards/tests.
- [x] Run `npm test`.
- [x] Run `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`.
- [x] Run `node --check sw.js`.

## Working Notes

- 2026-05-18 staging evidence: diet `사진 선택` first opens the fallback helper because Samsung Internet could not open the browser/system photo picker.
- The helper's `일반 선택창 열기` path successfully allows file selection and upload.
- Therefore the least surprising Samsung Internet image path is to skip `showOpenFilePicker()` for images and open the native file input fallback immediately from the user's original tap.
- 2026-05-18 staging evidence: exercise video selection can return to the app with a real selected video but generic file metadata, causing the strict `video/*` check to show "no video selected".

## Review

- Samsung Internet image uploads now skip the standards/system picker and go directly to the native file input path that worked from the fallback button.
- Diet photo selection, exercise image selection, and sleep capture all use the native image input path when the Samsung image system picker is disabled.
- Camera capture remains unchanged.
- Samsung exercise video selection now accepts video extensions, compatible video MIME types, and generic Android provider MIME values when the file came through the video picker path.
- If a selected video still cannot be applied, the next tap switches to the native fallback instead of repeating the misleading "no video selected" path.
- Exercise video uploads now use the video size limit, video upload timeout budget, and explicit Storage content type even when Android reports the file as a generic blob.
- Runtime assets were rotated to v187.
- Final verification passed: `npm test` (41 files, 293 tests), `node --check sw.js`, `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`, `git diff --check`.
