# 2026-06-24 Habit School English `/en` v1

## Checklist

- [x] Preserve `index.html` as the shared source and generate `en/index.html` from it.
- [x] Add route context APIs for Korean/default, Korean/simple, and English/simple `/en`.
- [x] Add a lightweight `ko/en` locale layer, locale-ready bootstrap, URL/date helpers, and DOM translation pass.
- [x] Implement the approved English public landing page and authenticated English app shell at `/en`.
- [x] Keep English v1 authenticated nav to Food / Exercise / Mind / Profile only.
- [x] Implement global-basic English Profile: account, language switch, notification permission, logout.
- [x] Hide Dashboard, Gallery, groups, rewards/assets, HBT, friend invite, and Kakao group from English v1.
- [x] Add English AI locale request path for diet, sleep/mind, and step screenshot analysis without changing schemas.
- [x] Use `gemini-2.5-flash` with `thinkingConfig: { thinkingBudget: 0 }`; do not introduce Gemini 2.0.
- [x] Use `en-US` for English meditation voice/recognition with browser fallback.
- [x] Store authenticated user language in `users.locale` and update Firestore user-field whitelist.
- [x] Add English privacy/terms pages faithful to existing Korean docs.
- [x] Add English manifest, OG image, sitemap entries, canonical/hreflang, and service-worker `/en` support.
- [x] Add/adjust tests for routing, generated entry sync, SEO/hreflang, locale fallback, English AI locale, and no-Korean English surface checks.
- [x] Verify required commands:
  - [x] `npm test`
  - [x] `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
  - [x] `node --check functions/runtime.js`
- [x] Browser-verify desktop and 390px mobile English landing/app flow, then compare implementation screenshots with approved concept images using `view_image`.
- [x] Commit and push to `origin main`.
- [x] Ask for deployment confirmation; do not deploy Firebase before confirmation.

## Design tokens from approved concepts

- Background: true white / very pale warm-neutral section bands, no heavy tint over media.
- Accent: bright health green with soft mint secondary panels; dark leafy text.
- Shape language: large rounded app surfaces, pill buttons, soft shadows, roomy spacing.
- Typography: friendly rounded sans fallback, high-contrast large hero headline, compact UI labels in app chrome.
- Landing composition: clean header, hero statement, Google CTA, Doctors0/video secondary path, phone-like product preview, simple product sections.
- App composition: mobile-first cards, four bottom/segment tabs, Food default, photo upload grid, AI analysis card, compact vitals.

## Review

- Implemented `/en` as the English official entry with generated `en/index.html`, English SEO/canonical/hreflang metadata, `manifest-en.json`, English OG image, sitemap entries, service-worker `/en` offline/deeplink support, and clean Firebase Hosting URLs.
- Added route context + locale APIs: `/` Korean/default, `/simple` Korean/simple, `/en` English/simple with Food as the default tab. English and Korean keep shared Firebase auth and record schema.
- Added the `ko/en` translation/runtime layer with locale-ready bootstrap, DOM translation, toast/status/error text handling, localized URL/date helpers, English Profile shell, and English-only v1 surface hiding.
- Added `locale` propagation to diet, sleep/mind, and step screenshot analysis while preserving response JSON schemas. English prompts use `gemini-2.5-flash` and `thinkingConfig: { thinkingBudget: 0 }`.
- Added `users.locale` storage/rules support and localized notification/re-engagement messaging.
- Added faithful English privacy/terms pages without changing dates, contacts, responsibility, or medical-disclaimer substance.
- Verification:
  - `npm test` passed: 51 files / 358 tests.
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js` passed.
  - `node --check functions/runtime.js` passed.
  - `node scripts\generate-en-entry.js --check` passed.
  - HTTP routing checked on local Firebase Hosting emulator: `/en` 200, `/en/` and `/en/index.html` 301 to `/en`, `/en/privacy` and `/en/terms` 200 with `.html` variants redirecting to clean URLs.
  - Search checks found no `gemini-2.0-flash`, no stale `?v=212` / `habitschool-v212`, and no Firebase SDK import outside `10.8.0`.
  - Desktop and true 390px mobile browser screenshots were compared with the approved landing and Food app concepts using `view_image`.
- Visual QA found and fixed a 390px mobile landing overflow caused by narrow viewport handling; re-check confirmed `scrollWidth=390` and no Korean text remained except the allowed `한국어` language switch.
- Firebase deploy intentionally not run; deployment requires user confirmation after commit/push.
