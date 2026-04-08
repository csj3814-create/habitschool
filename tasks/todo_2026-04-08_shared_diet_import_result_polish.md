# 2026-04-08 shared diet import result polish

## Goal
- Make the restored share-to-diet flow easier to verify on mobile after the user sends photos from the gallery.
- Keep the imported result visible inside the diet tab instead of relying only on a short toast.

## Plan
- [x] Inspect the current shared-photo import flow from share-target cache into the diet tab.
- [x] Add a compact in-page result banner for shared diet imports and focus the first assigned meal slot.
- [x] Run `npm test` and `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`.

## Review
- Shared diet imports now leave a visible banner below the upload CTA that shows how many photos were imported and which meal slots were filled.
- After a successful import, the diet tab now scrolls to the first assigned meal slot instead of bouncing the user back to the upload CTA only.
- The banner also keeps partial-import context such as skipped images from a different date or overflow when empty meal slots run out.
