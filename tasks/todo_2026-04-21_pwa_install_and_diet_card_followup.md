# 2026-04-21 PWA Install And Diet Card Follow-up

## Plan
- [x] Remove duplicate secondary copy from the compact profile diet-method card.
- [x] Restore one-click PWA install behavior by waiting briefly for the native install prompt before showing manual instructions.
- [x] Add regression checks for the compact diet card and install CTA flow.
- [x] Verify with tests/build.

## Review
- The profile diet-method card now shows only the requested main method line and hides the duplicate support line for active selections.
- The PWA install CTA now waits briefly for `beforeinstallprompt` on supported Android browsers, so a tap can still open the native install prompt instead of falling straight to manual instructions.
- Added source-level regression checks for the compact diet card rendering and the install CTA wait bridge.
- Verification:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
  - `node --check js/pwa-install.js`
