# Samsung Internet video selected file fallback v188

- [x] Confirm staging v187 is served but still contains the old video no-file message path.
- [x] Replace the remaining Samsung exercise video no-file copy with the fallback/retry message.
- [x] Preserve a picked video File when Samsung Internet cannot inject it into `input.files`.
- [x] Route strength preview, pending upload, save, and offline outbox through the preserved selected file.
- [x] Rotate runtime assets to v188.
- [x] Run `npm test`.
- [x] Run `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`.
- [x] Run `node --check sw.js`.
- [ ] Deploy staging and verify v188 is served.

## Notes

- Staging v187 was deployed and served, but `app-core.js` still had `noFileMessage: '영상이 선택되지 않았어요. 영상 파일을 다시 선택해 주세요.'`.
- The deeper risk is that `showOpenFilePicker()` can return a real `File` while Samsung Internet refuses or fails the programmatic `input.files` assignment. In that case the app must still keep the picked File and let preview/save/upload continue.

## Verification

- `npm test`: passed, 41 files / 293 tests.
- `node --check sw.js`: passed.
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`: passed.
- `git diff --check`: passed.
- Source scan for stale v187 and the old video no-file copy in runtime files: clean.
