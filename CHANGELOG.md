# Changelog

All notable changes to Habitschool are documented here.

## 2026-08-15 (3)

### Changed
- Folded the three health-data cards — body composition, current medications, blood test — behind one shared notice instead of three. They are all unlocked by the same optional consent, so someone who has declined was reading the same paragraph three times down the profile screen. Collapsed the group is a 45px line naming all three; consenting opens all of it, 1092px, with a single revoke button at the end rather than one per card.
- Pointed the guest tour at the button to press. The hints described the goal ("save it too") without saying which control does that, so each step began with a hunt. The next action is now computed from the prerequisite graph, exactly one button carries a 👆 cue and a pulsing ring, and the hint refers to that cue. Steps completed by looking rather than pressing — my records, gallery — say so plainly and mark nothing. The cue is `aria-current="step"` for screen readers, and the animation drops under `prefers-reduced-motion`.

## 2026-08-15 (2)

### Fixed
- Deployed the Firestore rules, which were behind the code and rejecting every consent write. `consents` was added to both user whitelists on 2026-08-11 when the consent system was built, but the live ruleset was still the one released on 2026-08-05 — rules sit deliberately outside the hosting/functions deploy shortcut, so they had never gone out. For the four days since, every write of a consent record failed with `permission-denied`. Across 562 members, **zero** had a consent record. The live ruleset now matches the file exactly.
- Stopped the member document write from swallowing its own failure. It carried the new signup's consent record and was wrapped in `.catch(() => {})`, so a rules rejection looked exactly like success and nothing surfaced at all. It now logs the code and message, and says explicitly when it was the consent that failed. Sign-in still proceeds — a logging failure should not lock everyone out.
- Made the re-consent screen name what it hit. `permission-denied` does not resolve by waiting, so telling someone to "try again shortly" sends them round a loop that cannot end. That case now says the write was not permitted; anything else shows its code.

## 2026-08-15

### Added
- A blood test analysis quality panel in the admin control tower, answering whether the feature is working without exposing anyone's results. It reports counts and distributions only — how many analyses ran, average metrics extracted, how many are missing a unit, a reference range or a valid status, how many lack a summary or advice, the grade distribution, and metric keys the model invented outside the prompt. No member's values and no uids cross the wire, because "is this working" does not require reading someone's cholesterol. An individual-record view would be a new processing purpose and would need the policy and an access log first.
- `healthProfile.latestBloodTestDate`, so a reflected measurement carries the date it was actually taken.

### Fixed
- Stopped treating an old health check report as a current measurement. People upload reports from years back — among the seven on file, one is from 2021 and one from 2023, and the model had been reading those dates correctly all along while the app ignored them. A result whose printed test date is more than a year old, or missing, no longer feeds `healthProfile`, so a triglyceride reading from 2021 cannot drive today's metabolic score. The analysis is still stored and still shown in history; it just stops claiming to be current.

### Changed
- Applied the same freshness rule in the backfill, which now reports who was skipped for staleness and still clears the stray dotted fields for them.
- Built the `analyzeBloodTest` fallback write from the same patch object rather than re-listing the fields by hand, so the two paths cannot drift apart.
- Rotated the cache to v315.

## 2026-08-14 (2)

### Fixed
- Stopped reporting an unverified save as a failed upload. When a follow-up step threw, the recovery path asked `verifyBackgroundMediaPersisted` whether the media had landed — and that function returned `null` for three different situations: confirmed absent, unreadable, and readable only from a cache that may not yet know about the write. The caller read all three as failure, so a photo that had uploaded fine showed "일부 업로드 실패" at 100%. It now reports `persisted` / `absent` / `unknown`, only says `absent` when the server itself answered, and treats `unknown` as deferred — re-queueing the patch instead of declaring a failure.
- Made the blood test result reach the profile it feeds. `analyzeBloodTest` wrote `{'healthProfile.hba1c': …}` through `set()`, which does not read dots as paths — it created a top-level field whose name contains a dot, while the nested `healthProfile.hba1c` that `metabolic-score` reads stayed empty. Anyone who uploaded a blood test still saw "건강 지표 기록 필요" on the insulin row. It now uses `update()`, which does interpret paths, and falls back to writing the nested shape if the member document is missing.
- Filed blood test results under the Korean date instead of the UTC one, so a test uploaded between midnight and 9am no longer lands on the previous day, and added `{merge: true}` so a second analysis on the same day no longer erases the first.
- Told a refused coupon resend apart from one that never reached the vendor. Any provider error produced "문자 재발송 요청이 지연되고 있어요. 잠시 후 다시 시도해 주세요." — including a 4xx refusal, which will never succeed no matter how many times it is retried, as happens with an already-used coupon. A 4xx now says the vendor refused and why it might have, while timeouts and 5xx keep the delay wording.

### Added
- Server-side sensitive-consent check on `analyzeBloodTest`. The gate existed only on screen, so calling the callable directly would analyse and store a blood test with no consent recorded — for Article 23 data.
- `scripts/backfill-bloodtest-health-profile-2026-08-14.js`, which walks the `bloodTests` collection group and moves each member's latest metrics into `healthProfile`, clearing the dotted top-level fields the old code created. It refuses to run without `--dry-run` or `--apply`, and never overwrites a value the member entered themselves.

### Changed
- Rotated the cache to v313.

## 2026-08-14

### Changed
- Shortened the re-consent notice to one line per change so it no longer scrolls on a phone. A consent screen that scrolls can hide the items and the button below the fold, which makes "they read it and agreed" harder to claim. Measured at 412×640: 583px tall with the button reachable and no internal scroll. The overflow guard stays as a safety net in case a future line pushes it over.
- Folded the health-data consent notice away until it is wanted. For someone who has decided not to use those features, the explanation was occupying a large block of the profile screen on every visit. It is now a `<details>` that starts closed, with the feature name in the collapsed line so it can be judged without opening — 45px collapsed against 189px before.

### Fixed
- Corrected a hex colour containing a Devanagari digit (`#b99a६d`), which browsers drop silently, and added a test that scans declaration values for `#` tokens that are not valid hex.

## 2026-08-13 (4)

### Fixed
- Corrected the storage location in the privacy policy, which was wrong. It said records and photos are stored in Seoul and that this is not an overseas transfer. Firestore is indeed `asia-northeast3`, and that much was verified — but the Storage bucket is `us-central1`, and I had assumed it matched rather than checking. So every uploaded photo and video, **including blood test report images**, sits in the United States while the policy told members nothing left the country. Section 5 now lists the two stores separately, marks Firebase Storage as an overseas transfer, and names the sensitive item inside it explicitly.
- Removed the claim that declining AI analysis means nothing is transferred abroad. The photo store itself is abroad, so uploading anything is already a transfer. The refusal clause now says plainly that refusing means the upload features cannot be used, while text-only use stays available and stays in Korea.
- Fixed the same false sentence in the re-consent notice, where it would have been shown to every existing member at the moment of collecting their agreement.

### Changed
- Rotated the cache to v311.

## 2026-08-13 (3)

### Added
- Asked existing members to agree to the revised documents. Raising `CONSENT_DOC_VERSION` marked the old agreements as stale but never collected new ones, and only new signups were recording `age14` — so for everyone already registered there was no record of consent to the revised terms at all. A member whose required consents are missing or stamped with an older version now gets a one-time notice after signing in, listing what changed (age floor of 14, the phone number passed to the coupon vendor, deletion now leaving nothing behind, and records living in Seoul) with links to the full documents.
- Kept an earlier refusal of health-data consent as a refusal. The optional box is restored from the member's existing choice rather than defaulted to agreed — a revision is not an opportunity to quietly upgrade a "no". Required boxes always start clear.

### Changed
- Extracted `buildConsentRecordFromSelection` so signup and re-consent write the same record shape. Two copies of a legal record is exactly the thing that drifts.
- Bound the re-consent checkboxes at load rather than when the modal opens. Binding only in the open path leaves a box that renders but does not respond if it is ever shown another way — which is how it behaved the first time it was exercised.
- Rotated the cache to v310.

## 2026-08-13 (2)

### Fixed
- Stopped telling members their reward failed when it had been paid. The `claimChallengeReward` callable is declared with `timeoutSeconds: 300`, but `httpsCallable` defaults to waiting 70 seconds — so an on-chain mint that ran long left the client giving up while the server carried on and credited the reward. `deadline-exceeded` was then reported as "보상 수령에 실패했습니다", to someone who had just received 30,000 HBT. The client now waits the full 300 seconds the server is allowed, so it hears the real answer.
- Treated a client-side timeout as unfinished rather than failed, as a backstop for the same case. `deadline-exceeded` means this client stopped waiting, not that the server failed, so the message now says the mint is still in progress and the screen goes and checks instead of asserting an outcome.
- Refreshed the asset screen after a claim more than once (immediately, then at 15s and 45s). The mint can land after the call returns, which is why the transaction history read as empty right after claiming and only showed the 30,000 HBT after leaving and reopening the app.

### Changed
- Made the waiting message stop promising "보통 30초~1분" once ninety seconds have passed. Past that point the useful thing to say is that it is still minting and the reward arrives whether or not the window stays open.
- Rotated the cache to v309.

## 2026-08-13

### Fixed
- Redrew the asset screen when a challenge is completed, not only when one fails. `settleExpiredChallenges` calls `refreshChallengeProgress`, which recomputes progress on the server — but it only refreshed the display when `expiredTiers` was non-empty. Finishing a challenge on its last day leaves that list empty, so the server was corrected and the screen was left behind: the "완료된 챌린지가 있습니다" toast appeared while the asset tab still read 29/30. Reloading did not help because the same visit that corrected the server never redrew; only a later visit, reading the already-corrected document, showed 30/30.
- Started the settlement before wallet initialisation rather than after it on the asset tab. `initializeUserWallet` is allowed up to six seconds, and the challenge recompute — an ordinary callable that has nothing to do with the wallet — was queued behind it, so yesterday's progress stood as fact for that whole window.

### Changed
- Stopped presenting a day count as final when it is known to be provisional. A challenge whose end date has passed while its status is still `ongoing` has not had its last day counted yet, so the card now shows "정산 확인 중…" in place of "97% · 남은 1일". The count itself stays visible; only the false certainty goes.
- Rotated the cache to v308.

## 2026-08-12 (6)

### Fixed
- Gave the redirect sign-in path a same-origin `authDomain`, which is what was breaking Google sign-in in the installed app on Samsung Internet. That combination is the only one that uses `signInWithRedirect` (forced back in April because popups fail there). `signInWithRedirect` parks intermediate state in the `authDomain`'s storage, and when `authDomain` is a different origin — `habitschool-*.firebaseapp.com` — that storage is third-party, which current browsers partition or block. `getRedirectResult` then comes back empty and the button gives up at "로그인 확인 중...". Popup users are untouched and keep `firebaseapp.com`, which they need: for popups the `authDomain` has to stay outside the PWA scope or Android opens the popup inside the app. The two requirements are opposites, and the mode is known from userAgent and display-mode before `initializeApp` runs, so the domain is chosen there.
- Stopped the service worker from touching `/__/` paths. It is network-first, so the auth handler still worked, but the response was being written into the cache — and those URLs carry per-attempt state, so a stale copy could be served back into a later sign-in.

### Verified
- `https://habitschool-staging.web.app/__/auth/handler` returns the Firebase handler, not the app shell, so Hosting serves it from our own domain and the rewrites do not swallow it.

### Changed
- Rotated the cache to v307.

## 2026-08-12 (5)

### Fixed
- Stopped recording "did not agree" for people who plainly did. Redirect sign-in sends the page to Google and brings back a fresh load, so every consent checkbox is cleared by the time `onAuthStateChanged` fires — which is exactly when a new member's consent record is written from those checkboxes. Anyone who signed up in redirect mode got a record saying they agreed to nothing. The selection is now snapshotted to `localStorage` before the redirect leaves and resolved from there when the page comes back empty, so the stored record reflects what was actually ticked.
- Restored the checkboxes on the way back, so the start button is not left locked behind consents the member already gave. This is the visible half of the same defect: the screen appears to return to the login prompt with nothing checked.

### Added
- Remembered consent per browser, version-stamped. Someone who has already agreed is not asked again on the next sign-in — the box is hidden and the required items stay satisfied, while an optional refusal of health-data consent is preserved as a refusal. Raising `CONSENT_DOC_VERSION` invalidates the record and asks again, which is what should happen when the documents change.

### Changed
- Rotated the cache to v306.

### Still open
- The reported sign-in failure is not yet root-caused. These fixes remove the dead end it leaves behind, and correct a consent record that was wrong regardless, but whether `getRedirectResult` is returning a user on the affected device is still unknown and needs the console from that device.

## 2026-08-12 (4)

### Changed
- Account deletion now deletes everything. `blockchain_transactions` and `reward_redemptions` had been held back in case they were records the E-Commerce Act requires preserving; the Service takes no cash payment and has no business registration, so that duty does not attach, and there is no other basis for keeping them. Both moved from `RETAINED_COLLECTIONS` to `OWNED_QUERIES`, and the retained list is now empty. The counting code stays so that anything added back in future is reported rather than quietly kept.
- Confirmed the Gemini API runs on a paid tier (Tier 1), which settles a question that materially changes what the policy has to say: on the paid tier Google does not train on submitted images or responses and human reviewers do not read them, whereas on the unpaid tier both would apply — to blood test reports among everything else. The policy states the tier and what follows from it.
- Corrected the overseas transfer disclosure after checking rather than assuming. `firestore:databases:get` reports `asia-northeast3`, so records and photos are stored in Seoul and never leave the country. Only images sent to the Gemini API cross a border, and the policy now says exactly that — including that declining AI analysis means nothing is transferred at all, while every other feature keeps working.
- Named the coupon vendor by its registered entity, 케이티알파 주식회사, and filled in the operator and privacy officer.

### Removed
- The "retained after deletion" sections in all four documents, and the retention-period blank that went with them. The privacy policy and terms now say without hedging that deletion leaves nothing behind.

### Changed
- Rotated the cache to v305.

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
