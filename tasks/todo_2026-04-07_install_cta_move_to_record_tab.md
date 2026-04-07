# 2026-04-07 install CTA move to record tab

## Goal
- Remove the transient floating install banner.
- Show a fixed Habitschool app install CTA in the record tab bottom CTA area.
- Hide the install CTA automatically once the app is already installed.

## Plan
- [x] Inspect the current install banner flow and the record tab bottom CTA structure.
- [x] Move install CTA rendering and visibility control into the record tab bottom action area.
- [x] Run project verification and summarize the final behavior.

## Review
- Removed the transient install banner DOM and floating banner CSS so install guidance no longer appears as a timed overlay.
- Reused the record tab bottom CTA slot for install, chat, and save modes by routing `saveDataBtn` through explicit `install`, `chat`, and `save` states.
- Simplified `js/pwa-install.js` to provide install CTA visibility/copy plus install/manual instruction actions, while keeping service worker registration intact.
- Verified with `npm test`, `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`, and `node --check js/pwa-install.js`.
