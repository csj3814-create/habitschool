# 2026-04-21 Diet Copy Refresh

## Plan
- [x] Find the diet method copy used in the record tab and remove the "사진 n장 준비됨" status text.
- [x] Replace each diet method guide line with the new requested Korean copy.
- [x] Update lessons with the user's correction pattern and verify with tests/build.

## Review
- Updated the diet method copy catalog so the record-flow guide uses the new short Korean wording, including `현미밥 채소 식단`, `저탄수 고단백 식단`, `16:8 간헐적 단식`, and the new Switch-On description.
- Removed adaptive `사진 n장 준비됨` text from the selected diet method guide box so the requested sentence stays fixed.
- Added tests covering the refreshed method copy and the absence of `준비됨` wording in selected-method guide states.
- Verification:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
