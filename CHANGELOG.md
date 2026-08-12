# Changelog

All notable changes to Habitschool are documented here.

## 2026-08-12 (3)

### Fixed
- Rewrote the terms of use and privacy policy against what the code actually does. Three statements were false. The policy said personal information is never given to third parties, but redeeming a coupon sends the recipient's phone number to the delivery vendor (`reward-market.js`, `phone_no`). It said everything is destroyed without delay on account deletion, but `blockchain_transactions` and `reward_redemptions` are deliberately retained (`account-deletion.js`, `RETAINED_COLLECTIONS`). The terms barred anyone under 18, and nothing in the codebase ever checked an age.
- Set the age floor at 14 — the threshold the Personal Information Protection Act actually uses — and made it a required checkbox at sign-up recorded as `consents.age14`, so the document describes a rule the code enforces rather than one it merely asserts.

### Added
- Disclosed everything the policy had omitted: sensitive-information consent under Article 23 and what declining it costs, the encrypted wallet private key and wallet address, per-device push tokens, step-count screenshots, blood test images, the Gemini API and Google Analytics as processors, and the overseas transfer that follows from running on Google infrastructure.
- Warned in both documents that account deletion erases the stored wallet key and that blockchain records cannot be deleted at all — the app already said this at the point of deletion, but neither document did.
- Added terms articles for the wallet and private key (Article 7) and for coupon redemption (Article 8), covering refunds, validity, and re-delivery.
- Added `tests/policy-documents-match-code.test.js`, which reads `RETAINED_COLLECTIONS` and the vendor payload out of the source and fails if the documents stop naming them. The documents drifted from the code once; this is what notices next time.

### Changed
- Rotated the cache to v304. The English policy pages are precached by the service worker, so they need the rotation to refresh.

### Still open
- Four blanks are marked `[[…]]` in the policy and cannot be invented: the operator's full name for the privacy officer field, the coupon vendor's legal entity name, the Firestore/Storage and Gemini processing regions, and the retention period pending a read of the E-Commerce Act on whether those records are covered at all.

## 2026-08-12 (2)

### Fixed
- Rebuilt the Firestore connection when it stalls, instead of calling a no-op. The reconnect probe called `enableNetwork(db)` on a client whose network had never been disabled — that resolves immediately and rebuilds nothing, so a stalled WebChannel stream stayed stalled and a page reload was the only cure. It now bounces the connection (`disableNetwork` then `enableNetwork`) once a plain probe has already failed, which tears the streams down, re-establishes them, and re-sends the mutations queued behind them.
- Stopped sending the daily-log save retry down the same dead stream. The first attempt now times out at 12s rather than 25s — a healthy write is acknowledged in well under a second, so a long wait on the first attempt only ever means a stalled stream — then forces a reconnect before retrying with the full 25s budget. Worst case falls from ~51s to ~38.5s, which also brings the whole failure path inside the 40s save-button watchdog so its toast no longer interleaves.
- Made "안전하게 저장했어요. 잠시 후 자동으로 마무리돼요." true. The offline outbox was only flushed on `online`, `focus`, and `visibilitychange`, none of which fire for someone who stays on the page, so nothing ever finished the save: photos appeared in the diet/exercise/mind tabs but the gallery stayed empty, and the only way through was to reload and press save again. Queueing now schedules its own retry (4s, 10s, 25s, 60s, 120s), reviving the connection first since the replay jams in the same place, and confirms with a toast when it lands.
- Resumed pending saves after sign-in. A queued entry survived a reload but nothing picked it up, which is the other half of why pressing save again was required.

### Changed
- Rotated the cache to v303.

## 2026-08-12

### Fixed
- Waited for the points the server awards before building the share card. Points are not a value the client knows: the client writes `daily_logs`, and the `awardPoints` Firestore trigger fills `awardedPoints` afterwards. The share prompt was raised 900ms after the save and read the local cache, so a member who finished a full day and tapped "share" got a card stamped with the score from before that day counted. The card now polls the server copy (five attempts, 700ms apart), refreshes the daily-log, gallery, and prepared-media caches from what it reads, and shares anyway if the points never arrive — refusing to share would be worse than an out-of-date number.
- Recorded which day the prompt was raised for, rather than reading today's date again when the share finally runs. Across a midnight boundary those differ.
- Made the 3-day challenge reward claimable in the Lite version. `claimChallengeReward` lived in `blockchain-manager.js`, and `main.js` only assigned `window.claimChallengeReward` once that module had loaded — but Lite (play) mode never loads it, so the button's `onclick` called `undefined` and failed silently. The claim is one `httpsCallable` with no signing and no chain access, so it moved to its own `js/challenge-claim.js`, which `main.js` now imports lazily in every mode and `blockchain-manager.js` re-exports. One implementation, two entry points.

### Changed
- Rotated the cache to v302 so the above actually reaches installed clients.

## 2026-08-09

### Fixed
- Stopped the share media callable from discarding a photo whose size exceeded a per-item limit that had been scaled by batch size (6MB / 5 items = 1.2MB). A 1.63MB original cleared that easily, so a photo visible in the gallery feed rendered as a placeholder on the card and stayed one — being too large is not a condition the automatic retry could improve. The limit is a flat 6MB again.
- Checked the callable's response budget before committing an item's bytes rather than after, so the item that broke the ceiling is the one dropped instead of always being let through.

### Changed
- Loaded share card photos directly in the browser with `crossOrigin="anonymous"` instead of routing them through `prepareShareMediaAssets`. Storage already serves CORS, so the canvas is not tainted and `toBlob` works; the round trip existed only to avoid tainting. Measured on one real day: four photos took 3,980ms and 2.6MB of base64 through the server versus 2,328ms direct, and a second open is 35ms with zero function calls because the images are ordinary cacheable HTTP requests. The callable remains as a fallback when the CORS load fails, and strength video thumbnails still use it since they need ffmpeg.
- Cached decoded images for the life of a card build so preparation and drawing no longer decode the same photo twice.

### Added
- Retried thumbnail generation once on upload. It is a decode plus a canvas, which fails on a large photo on a loaded device, and the failure was previously caught, logged, and dropped — original saved, thumbnail field left empty, with no retry and no way back.
- Backfilled thumbnails that were never created, building them from the image the card already decoded and writing them back to the daily log. Verified in production: a 1,707,469 byte original now has a 7,771 byte thumbnail. Covers the fixed fields (four meals, mind photo); cardio and strength entries live in arrays and would require rewriting the whole array, so they are left for later.

## 2026-08-06

### Added
- Raised the gallery share card from four photos to nine, and generalized the tidy (정돈형) layout into per-row column plans (5→[2,3], 6→[3,3], 7→[3,4], 8→[4,4], 9→[3,3,3]) so every row spans the full width and only the 10px gaps go unpainted.
- Split the overlap (겹침형) and focus (포커스형) thumbnail strips into two rows past five extras, sizing them from the available width and a height band so they shrink instead of overflowing. Five extras or fewer render byte-identically to before.
- Made tapping a small photo in the overlap and focus layouts promote it to the hero, swapping it with the current hero so a second tap restores the original order. The card is a single canvas with no element per photo, so the tap is resolved by hit-testing the drawn frame coordinates topmost-first, unrotating the point for the tilted overlap tiles.
- Held the chosen order as photo keys (`category|originalUrl`, the key `collectShareCardMedia` already dedupes on) rather than positions, so hiding a category cannot repoint the selection at the wrong photo.

### Fixed
- Stopped four of the six hardcoded photo caps from silently defeating the new limit: the media signature in `ensurePreparedShareMedia` and the render key both truncated at four, so adding a fifth photo produced an identical cache key and never rebuilt the card.
- Stopped `drawPosterMediaTiles` from overwriting `frame.x`/`frame.y` in place while drawing rotated tiles, which destroyed the coordinates needed to resolve a tap.
- Stopped a single slow preparation from freezing the card into placeholders for the rest of the session. A cold container after a functions deploy exceeded the 12s client timeout, and the resulting all-placeholder batch was cached as though it were the answer, with no path to retry. An incomplete result is now remembered as incomplete and rebuilt once after a six second wait, at most twice.
- Bounded the share media callable's response so it cannot exceed the 10MB callable limit: the server returns whole originals base64-encoded, which four items could already overflow and nine would have made routine. Per-item size now scales with batch size and the response stops filling at 6MB, costing a few placeholders instead of every photo.

### Changed
- Chunked the share media request at five items in parallel instead of stretching the timeout, keeping per-container memory identical to the previous four-item requests. `shareMyCard` caps the whole build at 14s, so raising the inner limit would only move the failure to the share button.
- Sized the tile corner radius and matte inset to the tile, so two-row thumbnails are not swallowed by a fixed 34px radius. Tiles above 155px are unchanged.
- Removed the DOM/html2canvas share card that the canvas implementation replaced (`buildShareImageGrid`, `prepareShareThumbsForCapture`, `createSquareShareBlob`, `_ensureHtml2Canvas`, and the `.share-media-*` styles), all of which had no callers and still carried the old four-photo cap.
- PWA cache rotated to v301.

### Fixed
- Stopped reading a Giftishow fixed-end-date `limitDay` (`YYYYMMDD`) as a day count, which produced an expiry far outside the Firestore timestamp range and failed the entire redemption write after the coupon had already been issued and delivered.
- Clamped every reward validity period to a sane range so a poisoned catalog value can no longer reach a Firestore write from any read path.
- Validated the fallback date in `toSafeFirestoreDate` as strictly as the primary value.

### Added
- Mirrored the supplier coupon image into Firebase Storage at issuance and recovery, and served the HTTPS copy in the vault so the gifticon renders instead of being blocked as mixed content.
- Logged the field names (never the values) of a Giftishow status response that returns no PIN or image, so a stuck coupon is diagnosable without exposing coupon data.

### Changed
- Suppressed the "check your text messages" note when a real coupon image is already on screen.
- Stopped telling the member a coupon arrived when the server skipped issuance and returned an existing record; the toast now names what actually happened (unresolved, recovered, or already processed).
- Logged which redemption blocks a new one, so ops can find the record to reconcile or refund.
- Bounded the unresolved-redemption block to one hour so an unrecoverable order cannot lock a member out of a product forever; stale ones are logged for ops instead.
- Ran the five independent preflight reads concurrently instead of serially, so a cold start no longer stacks the Giftishow catalog and bizmoney round trips on top of each other.
- Gave the redemption callable the same 180s window as the function, so a slow-but-working issuance no longer surfaces as deadline-exceeded.
- Locked the redeem button while an issuance is in flight, and logged preflight, provider, and mirror durations.
- Returned the post-charge point balance from the redemption and applied it immediately, so the header no longer shows the pre-purchase number until a refresh.
- Made the admin reconcile order number optional, rejected a coupon PIN typed in its place, and recorded whether the evidence was a provider confirmation or an admin attestation.
- Dropped the invented countdown: measured redemption is preflight 755ms + provider 348ms + mirror 432ms, so the UI now stays quiet for five seconds and only then reports elapsed time.
- Dropped the product thumbnail when the supplier gifticon image is on screen, since that image already carries the product photo and name.
- PWA cache rotated to v300.

## 2026-07-19

### Fixed
- Rejected nearly uniform black decoder frames instead of persisting them as successful exercise-video thumbnails on Samsung devices.
- Sampled several positions across each exercise video and waited for a decoded frame before generating the local and Storage thumbnail.
- Kept a clear video placeholder instead of falling back to a black video surface when no valid frame can be decoded.

### Changed
- PWA cache rotated to v244.

## 2026-07-18

### Fixed
- Captured a persisted JPEG thumbnail from the already decoded exercise-video preview instead of replacing the saved card with a black fallback while deferred thumbnail work finishes.
- Kept the local video frame visible after save until its thumbnail is ready, including videos larger than 20 MB.
- Shortened the coupon expiry label by removing the estimated `product basis` suffix so the date and remaining days fit on one line.

### Changed
- PWA cache rotated to v243.

### Fixed
- Rendered selected exercise videos from their local video frame immediately instead of leaving large or slow-to-decode files as black placeholders while upload thumbnails are prepared.
- Added owner-only background reconciliation for coupons that Giftishow issued successfully but remained `pending_issue` after a Firestore finalization failure.
- Preserved existing point deductions and provider transactions during coupon reconciliation so recovery cannot issue or charge twice.
- Accepted additional Giftishow PIN and barcode response field aliases when restoring coupon details.

### Changed
- Kept the coupon-vault snapshot fast while reconciling only unresolved coupons in the background.
- PWA cache rotated to v242.

### Fixed
- Replaced blocked or broken Giftishow coupon images with a locally generated PIN barcode instead of showing broken-image alt text.
- Derived missing coupon expiry from the catalog validity period and labeled the derived value as product-based in the vault.
- Stopped treating a successful Giftishow resend API response as proof that the MMS reached the device.
- Required an explicit Giftishow success code instead of accepting provider responses with a missing code.

### Changed
- Recorded MMS resend acceptance separately from delivery confirmation and updated the user guidance for spam filtering and delayed delivery.
- PWA cache rotated to v241.

## 2026-07-17

### Added
- Added an owner-only `resendRewardCoupon` callable and a `문자로 다시 받기` action in the coupon vault.
- Added a separate Giftishow MMS resend action to the reward-market admin console.

### Fixed
- Normalized Giftishow expiry values supplied as epoch seconds, epoch milliseconds, or provider date strings before Firestore writes.
- Reconciled idempotent retry requests through the existing provider transaction instead of issuing a second coupon.
- Blocked unresolved same-user/same-SKU live redemptions from creating another provider order.
- Added server-side resend reservation, five-minute cooldown, and a KST daily limit of three requests without additional point deduction.
- Removed the reward-market admin dependency on the full users/daily-log dashboard scan and rendered issuance rows first.

### Verification
- `npm test` (556 passing; 7 Firestore emulator-only tests skipped in the local run)
- `npx esbuild js/app.js --bundle --format=esm --platform=browser`
- `node --check functions/reward-market.js`
- `node --check functions/runtime.js`
- PWA cache rotated to v240.

## 2026-07-10

### Security
- Blocked client-forged coin minting via `daily_logs.awardedPoints`: `firestore.rules` now whitelists/caps `awardedPoints` (diet 30 / exercise 30 / mind 20) and the `awardPoints` trigger clamps the credited diff server-side (`functions/points-utils.js`).
- Made reactions server-authoritative to stop reaction-based coin minting: any signed-in user could previously write arbitrary UIDs into `daily_logs.reactions` and mint coins for the post owner (and inflate MVP score). New `toggleReactionOnPost` callable toggles/awards with the verified `request.auth.uid` only; `firestore.rules` now bars client writes to `reactions`/`reactionPointAwardedUserIds`. Replaces the `awardReactionPoints` trigger.
- Made `claimChallengeReward` atomic with a per-user/tier claim lock (`create()` mutual exclusion) to prevent concurrent double-claim of reward points / bonus HBT during on-chain settlement.
- Made the `mintHBT` lock atomic (`create()` instead of get-then-set) to prevent concurrent double-deduct / double-mint.
- Enforced `shareSettings` server-side: `daily_logs` stays gallery-public, but hidden fields (userName, gratitude) are stripped from the public doc and the gratitude original is kept in an owner-only `daily_logs/{id}/private/mind` subdocument. (Default sharing remains public by product decision.)

### Changed
- Extracted the challenge settlement/qualification math into `functions/challenge-utils.js` (single source of truth) with behavioral tests — previously untested inline logic in `runtime.js`, the top recurring-bug area.
- Extracted pure friendship predicates into `js/friendship-utils.js` as the first safe step of splitting the 1MB `app-core.js` monolith.

### Fixed
- Suppressed stale in-app notification toasts: notifications older than 30 minutes are now silently marked seen instead of popping up late when the app is reopened (applies to all notification types, not just `friend_connected`).
- Fixed the admin member table's "발송됨" feedback badge breaking on apostrophes: replaced onclick interpolation with `data-*` attributes and a delegated click listener.

### Chore
- Removed tracked scratch file `temp_cmd.txt` and the byte-identical duplicate `HBT_TOKENOMICS.txt`; ran `git gc` (loose objects ~61 MiB → packed ~7.7 MiB).

### Verification
- `npm test` (409 passing, incl. new `points-utils`, `challenge-utils`, `friendship-utils` suites)
- `npx esbuild js/app-core.js --bundle --external:https://* --format=esm` (client bundle parse check)
- `node -c functions/runtime.js` (server syntax check)

### Deployment
- Production (`https://habitschool.web.app`, PWA v226): security hardening + notification fix — commits `d5c9978` → `0b5ae5b`.
- Pending deployment (committed, staged for staging→prod): settlement extraction `bfbadad`, friendship extraction `6d60ec2`, admin badge fix `9ded33d`. Note: the next production deploy must bump the PWA version past v226.

## 2026-06-25

### Changed
- Added the English `/en` simple app entry and polished its signed-in design hierarchy.
- Updated English simple app cards, upload zones, AI buttons, and CTAs to better match the Korean simple visual quality.
- Rotated PWA/assets through v216 so production clients receive the latest English styling.

### Fixed
- Fixed remaining Korean labels in the English Exercise and Mind simple flows.
- Updated meditation guide tests to cover the current English/Korean guide toggle copy.

### Verification
- `npm test`
- `npm run check:en`
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
- `git diff --check`

### Deployment
- Production: `https://habitschool.web.app/en`
- Latest production commit: `ecfccb3 Polish English simple app styling`

## 2026-06-04

### Added
- Added the exercise habit group pilot model with four group types:
  - 10,000-step walking
  - Home training proof room
  - Gym attendance
  - Running club
- Added per-group reward progress so users can join up to two exercise groups and progress each group independently.
- Added paid group entry support with a 200P entry fee and 3,000P reward target for 100 approved completions.
- Added leader review workflow for habit group checkins:
  - Group leaders can see pending submissions on the dashboard.
  - Leaders can approve or reject submitted records.
  - Reward progress advances only after approval.
- Added Firestore index support for leader review queues on `habit_group_checkins(groupId, reviewStatus)`.
- Added production deployment of habit group callable/functions:
  - `joinHabitGroup`
  - `leaveHabitGroup`
  - `reviewHabitGroupCheckin`
  - `transferHabitGroupLeader`
  - `onHabitGroupCheckinWritten`
- Added a user-facing Korean changelog page refresh for the latest habit group and gallery entry updates.

### Changed
- Updated the gallery community CTA so users enter the Kakao OpenChat directly without account-linking friction.
- Increased habit group dashboard visibility to show up to four groups while keeping membership capped at two groups.
- Refined the joined group dashboard copy:
  - Removed repeated "today submitted / pending review" copy from compact group cards.
  - Kept progress copy concise with completion, approved, and pending counts.
- Collapsed unavailable recommendations by default when a user is already in two groups.
- Replaced repeated "2 groups joined" labels with a single "maximum 2 groups" section-level control.
- Sorted recommended exercise groups by participant count.
- Rotated PWA assets through v208 to ensure mobile/PWA clients pick up the latest runtime.

### Fixed
- Fixed mojibake in `changelog.html`, where Korean release notes were rendered as question-mark placeholder text.
- Fixed same-day group reward progress so two joined groups can each count on the same date when both conditions are met.
- Fixed duplicate checkin counting within the same group and date by keeping progress scoped to `user + groupId`.
- Fixed Samsung Internet exercise video uploads that could remain stuck around 1% by using the safer upload path for exercise videos.
- Fixed leader review media rendering:
  - Photos now open in the existing gallery lightbox.
  - Videos now render as playable video only when a real video URL is available.
  - Older pending checkins are hydrated from the related daily log when the original video URL was missing from the checkin snapshot.
  - Thumbnail-only records no longer pass image URLs into a `<video>` source.
- Fixed date rollover behavior so returning after a new day reloads the selected date more reliably.

### Verification
- `npm test`
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
- Focused habit group and PWA versioning Vitest suites
- `node --check functions/runtime.js`
- `git diff --check`

### Deployment
- Staging: `https://habitschool-staging.web.app`
- Production: `https://habitschool.web.app`
- Latest production commit: `6b0b080 Update habit group and gallery entry UI`
