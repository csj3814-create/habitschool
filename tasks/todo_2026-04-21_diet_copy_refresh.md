# 2026-04-21 Diet Copy Refresh

## Plan
- [x] Find the diet method copy used in the record tab and remove the "사진 n장 준비됨" status text.
- [x] Replace each diet method guide line with the new requested Korean copy.
- [x] Remove `고단백 식단`, collapse legacy selections into the remaining method set, and simplify the selected-method card to a single clickable box.
- [x] Update lessons with the user's correction pattern and verify with tests/build.

## Review
- Updated the diet method copy catalog so the record-flow guide uses the new short Korean wording, including `현미밥 채소 식단`, `저탄수 고단백 식단`, `16:8 간헐적 단식`, and the new Switch-On description.
- Removed adaptive `사진 n장 준비됨` text from the selected diet method guide box so the requested sentence stays fixed.
- Added tests covering the refreshed method copy and the absence of `준비됨` wording in selected-method guide states.
- Removed `고단백 식단` from the selectable catalog and mapped legacy `high_protein` preferences onto `저탄수 고단백 식단` so existing users do not fall back to `미선택`.
- Removed the extra support line from the dashboard selected-method card and made the whole card open the selector instead of rendering a separate `프로필에서 바꾸기` button.
- Verification:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
