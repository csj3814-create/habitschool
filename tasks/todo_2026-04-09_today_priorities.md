# 2026-04-09 Today Priorities

## Goal

- Turn the latest session wrap-up and recent task notes into one focused list for today's work.
- Prioritize the remaining Android/TWA validation work before starting new feature work.

## Task List

- [ ] Reproduce and fix the Android photo-share issue where Habitschool opens but shared images do not land in the diet flow.
- [x] Verify the Health Connect step handoff into the exercise tab on a real device.
- [ ] Re-check the Android share entry on-device in plain user terms:
  share target appears in the device share sheet, the app opens the intended record flow, and the launcher icon looks correct on Samsung/One UI.
- [x] Document the user feedback from today and reflect the wording lesson in `tasks/lessons.md`.
- [x] Verification after the fix:
  `npm test`, `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`, `cd android && .\gradlew.bat :app:assembleDebug`
- [x] Fix the milestone card state so legacy users do not see first-step rewards/events again when later milestones in the same category are already completed or claimed.

## Next Phase

- [ ] Run the TWA release-signing and assetlinks workflow with the real release keystore.
- [ ] Verify fullscreen TWA behavior on-device after the real release keystore and assetlinks flow are applied.

## Simple Mode

- [x] Add a `/simple` Firebase Hosting route that serves the main web app without creating a separate codebase.
- [x] Implement a first-pass simple mode that only exposes `식단`, `운동`, and `마음`.
- [x] Add a clear `기본 모드로 보기` escape hatch from `/simple`.
- [x] Show a plain-language toast when Android share opens the diet flow without auto-saving the shared image.
- [x] Enlarge the simple-mode brand header, relabel the escape button to `기본형`, and shorten the mind save CTA copy.
- [x] Add a simple-mode profile surface from the header with points, QR-first invite/community access, and a bottom install CTA.
- [x] Fix the simple-profile footer install CTA so it keeps the install action instead of silently reverting to the default save flow.
- [x] Replace the simple-mode tab hero copy with direct `오늘 ... 기록하세요` headings and remove the redundant `간편 프로필` label.
- [x] Verification after the simple-mode change:
  `npm test`, `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`

- [ ] Deploy the latest simple-mode action-only polish to staging after local review.

## Sources

- `tasks/todo_2026-04-09_session_wrap_up.md`
- `tasks/todo_2026-04-08_android_native_step_handoff.md`
- `tasks/todo_2026-04-08_android_share_sheet_and_icon_regression.md`
- `tasks/todo_2026-04-08_shared_diet_import_result_polish.md`
- `tasks/todo_2026-04-08_twa_release_signing_and_assetlinks.md`
- `tasks/todo_2026-04-08_mobile_helper_copy_and_twa_release_readiness.md`

## Notes

- `main` and `origin/main` were recorded at `3294ced` in the latest wrap-up.
- Health Connect step import was user-verified on-device on 2026-04-09.
- The remaining immediate risk is the Android photo-share path opening the app without completing the diet import flow.
- Android share fallback now routes `ACTION_SEND` / `ACTION_SEND_MULTIPLE` launches to the diet shared-upload deep link when the browser does not hand the payload to `/share-target`, so the user lands in the diet flow instead of the dashboard.
- The launcher icon inset was restored to the previously user-validated asymmetric spacing to avoid Samsung/One UI cropping down to only the face.
- The milestone card now normalizes legacy category progress so lower steps such as `diet1`, `exercise1`, or `mind1` are auto-filled from higher claimed levels instead of resurfacing as fresh `start +5P` rewards.
- The simple-profile footer install CTA now has its own `profile` branch in the shared submit-bar updater so the visible label and the underlying action mode stay aligned, and the milestone checker no longer references an undefined `coins` variable.
- The latest simple-mode polish replaces hidden guide copy with direct tab headings such as `오늘 식단 기록하세요` and removes the extra `간편 프로필` chip so each screen starts with the actual task, not the mode label.
- TWA release-signing and fullscreen verification were explicitly deferred to the next phase.
- Older untracked task notes from `2026-04-07` remain outside today's scope unless priorities change.
