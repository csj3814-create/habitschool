# Changelog

All notable changes to Habitschool are documented here.

## 2026-08-23

### Fixed
- Stopped the gallery feed from stalling partway down. Three separate faults each left it unable to recover on its own. The loading flag was set before appending posts and cleared after, with nothing in between to guarantee the clear — one post that threw while rendering locked the flag on, and every later attempt returned at the guard on the first line. `IntersectionObserver` only reports the moment an element crosses into view, so once a load came back empty and the page stopped growing, the sentinel sat on screen and never fired again; scrolling in place did nothing and only leaving the tab and returning cleared it. And a failed fetch was swallowed by a `catch` that logged and returned nothing, so the caller could not tell "nothing left to load" from "could not load it", left `galleryHasMore` set, and recursed into the same failure without limit. The flag is now released in a `finally`, the observer is re-armed after each load so a sentinel still in view immediately asks for the next page, the fetch reports success or failure, and the retry chain is bounded.
- Kept the sentinel visible when a filter happens to exclude an entire page of results. It was hidden on local cache exhaustion alone, so with more posts still waiting in Firestore the infinite scroll never started at all.

### Changed
- The feed now starts loading about 1000px before the bottom rather than 100px, and appends 12 posts at a time rather than 6. At the old settings a page of 30 cached posts took five observer round-trips to display, and anyone scrolling at a normal pace saw the spinner before the next posts arrived.
- When a load genuinely fails, the three loading dots are replaced by a retry button. A permanent "load more" button would add a tap to the normal case, but a network failure needs some way out other than reopening the tab.

## 2026-08-21

### Fixed
- The monthly MVP ranking had been counting zero comments and zero reactions all month. Reaction writes moved to `gallery_posts` when the old path was closed off — a signed-in client could forge other people's UIDs into `daily_logs.reactions` and mint coins — but the three aggregation sites kept reading the old location. August showed "0 reactions" on screen against 494 actual ones, and the MVP score collapsed to `days x 10` alone, which put six people on exactly 210 points. The medals were being handed out in Firestore scan order, and 5,000P with them. The score now reads from where the data actually lives, and the three copies of the formula are one shared module so the screen and the payout cannot drift apart again.
- Gave the ranking a deterministic tie-break. Sorting on score alone left equal scores in whatever order the scan returned, so the medals could change between hourly runs. Ties now resolve by activity points, then days, comments, reactions, and finally user id — the same input produces the same ranking every time.

### Changed
- From September the MVP score is based on activity points rather than days recorded. Recording every day no longer distinguishes anyone: 21-day perfect attendance was reached by six people in August, while their activity points ranged from 690 to 1,390. Points already grade the depth of a record — meal photos, cardio and strength, sleep and gratitude, 10 to 80 a day — and among August's most consistent members every single one had a different total. Comments and reactions still count, weighted to keep the share of the score they had before, but the social part is capped at 30% of a member's own activity points: a reaction is one tap, and one member left 356 of August's 494, which without a cap would have been half their score. August and earlier keep the old formula, so past months and the rewards already paid for them are unchanged.
- The weekly gallery list now uses the same basis, from the first full week of September. Its ceiling is seven days rather than thirty, so it saturated harder — ten members were tied at five days this week, and the top two at the same score.

## 2026-08-20 (5)

### Changed
- Raised the compression threshold to 15MB, so ordinary clips upload straight away and only genuinely large files are re-encoded. Re-encoding runs at playback speed and no amount of accurate progress reporting removes that wait; a 7MB ten-second clip is a theoretical win on a slow uplink and still reads as "why isn't this uploading" in the hand, which is what made the feature unusable. Above 15MB the arithmetic stops being close — a 200MB file becomes about 4MB — and the wait buys something obvious. The consequence is that a 7MB hyperlapse goes back to being sent as recorded, which was the original complaint about slow uploads; that trade is deliberate, since the compression wait was the worse of the two.

## 2026-08-20 (4)

### Fixed
- Stopped the progress bar from freezing at 89% for the whole upload. Compression reported its percentage through the same channel as transfer progress, and that value is recorded with `Math.max` — so finishing compression wrote 100 into the transfer figure before a single byte had been sent, and it could never come back down. `transfer 100 / sync 6` is exactly 89%, and the bar sat there for the entire real upload while the work went on invisibly. Compression now reports through the message line only and leaves the transfer figure at zero, so the bar reads 0 during compression and then actually moves 0→100 as the file goes up. I introduced this in the previous release; it is the same class of thing this session has been fixing elsewhere — a number that says one thing while another is happening.
- Set the encoder bitrate from the target upload size rather than resolution alone. Choosing by resolution meant a 40-second 4K clip came out at 12.5MB, which on a slow uplink is another two-minute upload — the compression had traded one wait for a shorter version of the same wait. Bitrate is now derived from a 4MB target and clamped for quality, so a 40-second clip lands near 4MB whatever its resolution, roughly three times faster to send than before. Beyond about a minute the quality floor wins and files grow again: three minutes still produces 10–19MB, which is the honest limit of holding both size and watchability.
- Raised the compression threshold from 2MB to 4MB, matching the target size. Re-encoding a file already smaller than the result costs playback time and returns nothing.

### Notes
- Re-encoding runs at playback speed and cannot go faster by this route; a 40-second clip costs 40 seconds or more, since decode and encode share the phone. Getting below that needs WebCodecs with an MP4 demuxer, which is a much larger change. What this release removes is the second wait after it, not the first.

## 2026-08-20 (3)

### Changed
- Raised the video size limit from 100MB to 600MB, but only where the phone can actually re-encode. What gets uploaded is the compressed file, and its size comes from duration and bitrate rather than from the original, so a 40-second 200MB hyperlapse lands at roughly 6MB from a 1080p source or 12MB from 4K. Applying the wider limit everywhere would have made things worse rather than better: iOS Safari has no `HTMLVideoElement.captureStream`, so on an iPhone the 200MB file would have gone up untouched. The limit now follows `canCompressVideoInBrowser()`, and both selection paths — the multi-file picker and the single-file preview — read the same value, since widening one alone would mean the same file is accepted or refused depending on how it was chosen.
- Set the encoder bitrate from the source resolution: 800kbps up to 720p, 1.2Mbps up to 1080p, 2.5Mbps above that. Dropping the canvas downscale meant output resolution follows the input, and a 200MB file is usually large because it is 4K rather than because it is long. A flat 1.2Mbps would have shrunk it correctly and left it unwatchable.

### Added
- Capped video length at 3 minutes, checked when the file is picked. Re-encoding runs at playback speed, so length is the wait, and without a cap someone choosing a 10-minute clip waits ten minutes before seeing any result. Refusing at selection also says why: left to the size check further down, the same file would come back as a size error after the picker had already accepted it.
- Explained the size rejection that can still happen. A file large enough to need compression, on a device that then fails to compress it, is refused at upload with a message saying the phone could not shrink it — rather than a bare size limit the member was told moments earlier did not apply.

## 2026-08-20 (2)

### Added
- Re-encode exercise video before uploading it. Photos went through `compressImage` and video went up exactly as recorded, so a phone's 1080p default bitrate turned a 10-second hyperlapse into 7MB — which on a congested LTE uplink is the whole complaint. The original now plays into a `MediaRecorder` at 1.2Mbps, with no dependency and no demuxer, which CSP rules out anyway. It costs playback time: a 10-second clip takes about 10 seconds, still less than sending 7MB over a slow link. Measured on worst-case noise footage, 4.82MB became 1.46MB with the duration intact; real footage compresses further. Anything under 2MB is left alone, since the wait would buy little.
- Refused to produce webm. Only `video/mp4` output is accepted, and where mp4 recording is unavailable the original is uploaded untouched. iOS Safari cannot play webm, and it is the same browser that cannot compress at all, so a webm store would have meant Android uploads that iPhone friends could not open — trading upload time for broken playback.

### Fixed
- Discarded a re-encode that comes back shorter than the source. The first implementation drew each frame onto a canvas so it could downscale, and canvas frames only flow while the page is actually painting. Leaving the app mid-transcode produced a 0-second file — which, being tiny, sailed through the "did it get smaller" check and would have replaced a member's recording with an empty one. Capturing the video element's own stream survives the page being hidden, verified side by side: 0.0s from the canvas route against 5.0s from the stream, under identical conditions. The duration check stays regardless, because size alone rates a truncated file as the best possible result.
- Added the new module to the service worker's pre-cache list, without which it would have failed to load offline. Caught by `pwa-offline-assets`, which walks the import graph rather than trusting the list to be kept up to date by hand.

## 2026-08-20

### Fixed
- Let the free 3-day challenge start in the Lite app. `window.startChallenge30D` begins life in main.js as a placeholder that alerts "블록체인 모듈 로딩 중입니다", and the real one only replaces it once blockchain-manager loads. Lite never loads that module by design, so the placeholder was permanent and the mini challenge told people to wait for something that would never arrive. The start needs no chain at all — `challenge-3d` has `hbtStake: 0`, so the on-chain branch is skipped entirely and one callable is all that remains. It now sits in challenge-claim.js beside the claim, which was split out for exactly this reason and had the fix applied only to itself. `blockchain-config.js` is safe to import there: it has no imports of its own and holds only constants, so no wallet, key, or on-chain call comes with it. A paid tier arriving on this path is refused loudly rather than started without its stake, though Lite hides those cards anyway.
- Stopped the friend-connected push from naming its own recipient. Two of the three call sites sent `friendName: outcome.inviterName` to the inviter, so whoever invited or referred someone was told "최석재님과 이제 함께 기록할 수 있어요" about themselves. The accept-request path had it right all along and shows the shape the other two should have had. Both now carry the other party — the member who signed up, or the one who used the link.

### Notes
- Looked into the slow video upload and did not change it, because nothing in the upload path is misbehaving. The timeouts are generous (5 minutes hard, 90 seconds idle for a 7MB clip), so nothing is being cancelled and re-sent, and thumbnail extraction is deferred behind `requestIdleCallback` rather than blocking the start. What stands out instead is that **video is never compressed**: images go through `compressImage`, video is sent exactly as recorded, up to a 100MB ceiling. A 7MB clip on a congested LTE uplink is simply a lot of bytes. Firebase's resumable upload does send it as five serial chunks (256KB doubling to 4MB) plus a create request where the Samsung path uses a single PUT, but that is worth a fraction of a second, not the difference being reported. Making the file smaller is the lever with the certain payoff, and that needs a decision on approach before building. Upload sizes could not be measured directly — the service account key was revoked on 08-15.

## 2026-08-15 (9)

### Changed
- Removed "the name of the chat room the command came from" from the collection list. No such value reaches us. MessengerBot R v0.7.29a puts the Android notification title in `room`, and in the production open chat that title is the speaker's own nickname, so every participant reports a different value and none of them names a room. The nickname is already disclosed on its own line, so the list is now complete rather than shortened. Reported from the bot repo, verified against `routes/messengerbot.js` before editing — removing an item from a privacy policy is the direction that under-discloses, so it is the direction to check hardest.
- Struck the room-name filter from `tasks/habitchatbot-linking-prompt.md`, which I had written as a prerequisite for the whole linking feature. It cannot be built: `isGroupChat` is false for open-chat traffic and the legacy `response()` API in that version exposes no stable channel id. The leaked-code risk it was meant to cover is handled instead by what the code itself does — ten-minute expiry, single use, redaction from logs, and never echoing the code back into the room. Room separation is an operating agreement between the two rooms, not something the code can enforce. The note stays in the file rather than being deleted, since the reasoning is what stops the next person reaching for the same non-existent filter.

## 2026-08-15 (8)

### Fixed
- Made cardio photos wait for their thumbnail before writing the record. `getStrengthThumbWaitMsForJob` returned 0 for anything that was not a strength video, and `finalizeBackgroundMediaUploadResult` gated on `job.kind === 'strength'` a second time, so a cardio save wrote `imageThumbUrl: null` the moment the original landed. The thumbnail then finished uploading, reached Storage, updated the in-memory entry and the preview — and never reached Firestore. The stored data carries the shape of that one condition: 24.2% of cardio photos have no thumbnail against 10.8% of strength videos, and strength is the half that waits. Both gates now ask `getMediaThumbWaitMsForJob`, which answers for the kind it is given. The wait only happens when the thumbnail is genuinely still in flight, which is the minority of saves.
- Extended the share-card thumbnail repair to exercise media, which had been excluded since it was written. Diet and sleep passed a `backfill` descriptor and exercise passed nothing, so a cardio photo or strength video that lost its thumbnail had no way back. The obstacle was real — `exercise.cardioList[0].imageThumbUrl` cannot be expressed as a dotted path, and writing the index as an object key would convert the array to a map and corrupt the document — so array items now go through `applyArrayThumbBackfill`, which re-reads the document, matches the item by its original URL rather than its position, skips it if something else filled it in first, and rewrites just that list. The per-session guard is keyed by list and URL too; keyed by field name alone, only the first cardio photo of the day would ever have been repaired.

### Changed
- Established that the 430 orphaned thumbnails must be regenerated, not re-linked, and did not write the linking script. 95% of originals do have a thumbnail file sitting in Storage, which made re-linking look like the cheap option, but the paths share no token — `{ms}_{seq}_{name}` is assigned independently for each upload. Checking the rule against the 1,837 pairs that are already correctly recorded: 77% of filenames do not even parse, the naming having changed over time, and among those that do the sequence gap is 1 for only 83.3%, with 2, 3 and 4 all present. Time proximity is worse — median 7.6s, 95th percentile 48.7s, longest 12 minutes. Roughly one in six items would have been given a different photo's thumbnail, which is a worse outcome than the blank it replaces. `scripts/validate-thumb-pairing-rule.js` keeps the check. The client-side repair above regenerates from the original instead, which is unambiguous, and reaches each record as its owner opens that day's share card.

## 2026-08-15 (7)

### Fixed
- Made `hidden` actually hide things. `[hidden] { display: none }` is a browser default, so any author rule that sets `display` on the same element beats it — and then `el.hidden = true` silently does nothing. The strength-video preview was the visible casualty: the `<video>` stays laid out over the `<img>` (both `position: absolute; inset: 0`, video later in the DOM) and paints its own `#0d1117` background, so a thumbnail that had downloaded correctly showed as a black box. An audit found the same trap on 8 classes, and the ~20 one-off `.foo[hidden] { display: none }` rules scattered through the stylesheets turn out to be this bug being patched one site at a time without ever being named. A single `[hidden] { display: none !important; }` now covers all of them; no existing rule tried to make a hidden element visible, so nothing is displaced.
- Gave the strength thumbnail an `onerror`. Its `<video>` sibling has had `onerror = fallbackToImage` all along; the image path had none, so a dead thumbnail URL produced the same silent black box with no fallback, no retry, and nothing in the console. It now falls back to the placeholder and logs the URL. This was not the cause of the reported bug — the images were loading fine, HTTP 200 at 720px — but it was the reason the failure would have been just as invisible if they hadn't been.

### Added
- Added `scripts/count-missing-exercise-thumbs.js`, read-only, to size the separate backfill question. Across 2,547 daily logs: 315 of 1,302 cardio photos (24.2%) and 103 of 953 strength videos (10.8%) have no stored thumbnail, plus 12 legacy single-field records — 430 items over 38 members. The month-by-month split matters more than the total: 26 items in the first half of August alone, so thumbnail generation is still failing now and a backfill on its own would be mopping while the tap runs. Not yet fixed; the black-box report turned out to be a separate, unrelated defect.

## 2026-08-15 (6)

### Changed
- Narrowed the KakaoTalk disclosure to what the relay can actually collect. Yesterday's text was written against an assumption about the bot that turned out to be wrong: the group-chat path is a MessengerBot script on a phone forwarding to `/api/messengerbot`, not the official Kakao openbuilder, and it forwards **only messages beginning with `!`**. There is no stable sender identifier on that path either — the sender arrives as a display nickname. So the policy named an identifier that cannot be obtained and described a passive collection of speakers that will never happen. It now lists what the relay does forward: the command text, the display nickname, and the room name, gathered only when someone types a `!` command.
- Replaced "we do not collect message contents" with "messages that do not start with `!` are never sent to our server". The first is a promise about what we discard after receiving it; the second is a fact about what never leaves the phone. `CONSENT_DOC_VERSION` stays at 2026-08-15 — this removes collection items rather than adding them, and the 08-15 documents had only ever reached staging, so nobody agreed to the wider text and nobody is asked twice.

### Fixed
- Stopped the re-consent card from pushing its own agree button out of view. The rules that tighten consent rows live in `@media (max-width: 600px)`, but this card is a fixed 420px modal, so its density was keyed to viewport width while its ceiling is keyed to height. On a screen that is wide but short — a resized desktop window, a phone held sideways — the rows returned to full size against an unchanged ceiling and the content ran 669px inside a 592px card. The tightening is now keyed to `max-height: 700px`, where it belongs: 497px at 640×640 and 550px at 360×600, both fitting without scrolling, and tall screens untouched at 608px. Below roughly 580px the card still scrolls, with the button reachable.
- Corrected the previous entry's claim that the notice fits "on a 640px-tall screen". That measurement was taken at 360×640 and did not hold at 640×640, which is where the overflow above was found.
- Aligned the asset stamps that release (5) left behind. `styles.css`, `js/main.js` and the other module entrypoints were still pointing at `?v=319` while `index.html` and the service worker had moved on, so returning members would have kept the cached stylesheet and never received the layout fix. Caught by `pwa-versioning`, which the previous release was committed without re-running.

## 2026-08-15 (5)

### Added
- Disclosed the KakaoTalk group-chat linking that the new connection flow will use: the sender identifier Kakao provides, the display nickname, and the time of the last message — stated alongside the fact that **message contents are not collected**, only who spoke and when. The identifier and nickname are used solely to link the accounts and are deleted once linked or after 30 days, rather than waiting for account deletion, and the whole thing is optional.
- Added the same line to the re-consent notice, since that is what members are being asked to agree to right now.

### Changed
- Moved the effective date to 2026-08-15 across all four documents and raised `CONSENT_DOC_VERSION` to match, because the collection items changed materially. Anyone who already agreed to the 08-12 version will be asked once more.
- Tightened the re-consent spacing so the fifth line still fits without scrolling: 590px against a 592px ceiling on a 640px-tall screen, with the button reachable.

## 2026-08-15 (4)

### Fixed
- Kept the tab bar in step with the guest tour. Pressing "운동 기록 남기러 가기" moved the screen to the exercise tab while the tab buttons and underline stayed on food, because the active state is set inside the app's `openTab` and the tour was calling the demo controller's own `openTab` directly, skipping it. The jump now goes through the app's switch, with the internal one kept as a fallback.

### Changed
- Made the health-data notice read as something you open. The arrow was a small centred glyph that looked like punctuation; it is now a filled circle at the right edge with the text left-aligned, and the row has an 18px gap beneath it so it stops reading as part of the card below.
- Moved the tour's cue to the right edge of the button and enlarged it to 22px, where it nudges sideways instead of sitting to the left of the label looking like an icon. The button's pulse is faster and wider. Both stop under `prefers-reduced-motion`.
- Removed the coach box's "안내 닫기" and "전체 안내 끄기" buttons. The step guide already says what to do, so the remaining sentence is explanation rather than interruption, and a dismiss control for it was clutter.

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
