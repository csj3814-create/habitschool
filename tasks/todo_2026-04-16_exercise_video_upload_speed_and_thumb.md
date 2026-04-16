## 2026-04-16 Exercise Video Upload Speed + Thumbnail

### Plan
- [x] Review prior lessons and inspect the current strength-video upload, save, thumbnail, and progress-bar flow
- [x] Remove avoidable latency from the strength-video save path and thumbnail pipeline
- [x] Make the bottom background upload bar match the inline upload-progress UI treatment used elsewhere
- [x] Verify with automated tests and bundle checks

### Notes
- The current strength-video save flow waits up to 5 seconds for `thumbPromise`, even when a usable local thumbnail already exists.
- The local video thumbnail extraction path appears to be started separately from the upload pipeline, which risks duplicate decode work and stale thumbnail timing.

### Review
- Root cause 1: strength-video save still waited up to 5 seconds for the remote thumbnail, unlike the other deferred-upload tabs.
- Root cause 2: the same local frame extraction could run twice, once for preview and again inside the upload pipeline.
- Root cause 3: placeholder `data:image/*` values could leak into the local-thumb seed path and behave like a real thumbnail.
- Fix: shared the local thumbnail promise between preview and upload, filtered out placeholder data URLs, reduced thumbnail wait to `0ms` when a real local thumb already exists and `1200ms` otherwise, and reused the same compact upload-progress styling for the floating bottom status bar.
- Verification: `npm test` passed with `169` tests and `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js` completed successfully.

### Follow-up Review
- The first fix still left the strength-video save path waiting for the original upload URL before it queued the background job, so the bottom floating upload tracker only appeared after most of the transfer had already finished.
- The first fix also completed the background tracker before deferred video-thumbnail patches finished, which made “업로드 완료” race ahead of the actual thumbnail bind.
- Follow-up fix: strength videos now save like the other deferred media paths, queue the background job immediately when the file exists, and keep the floating tracker alive until the deferred thumbnail patch settles.
- Follow-up verification: `npm test` passed with `169` tests and `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js` completed successfully again.
