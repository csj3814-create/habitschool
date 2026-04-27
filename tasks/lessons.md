# 개선 교훈 (Lessons Learned)

---
## 2026-04-20 (Diet Method Reminder Consent)

### 177. When a user asks for a simple yes/no consent flow, keep both the copy and the state transition just as direct
- Symptom: the diet-method consent modal kept longer explanatory button labels and delayed the actual `remindersEnabled` save until after browser-level push permission succeeded, which felt indirect and did not match the requested `네 / 아니오` behavior.
- Root cause: I treated notification transport setup and product preference saving as the same state change, and I also left explanatory UI text too verbose for a binary decision step.
- Lesson: for preference consent modals, separate the app preference from device permission wiring. If the user says "yes", save the app-side setting immediately, then continue with device/browser setup as a follow-up step. Keep the modal copy and buttons as short as the decision itself.

### 178. Never ship `index.html` changes without an explicit integrity check for UTF-8 Korean copy and critical tags
- Symptom: staging deployed as a blank white page because `index.html` had been saved with broken Korean text and malformed tag fragments, even though the JavaScript bundle itself was fine.
- Root cause: I focused on module/test/build verification and missed that a shell-based edit had corrupted the HTML document encoding and markup before deploy.
- Lesson: if `index.html` changes, add and run a regression check that looks for a few exact Korean strings plus critical modal button markup, and do a quick fetch of the deployed HTML after hosting deploy. HTML integrity is a separate deploy gate, not something build success can prove.

### 179. In this repo, a user saying `스테이징` means deploy to the staging server, not just git staging
- Symptom: I treated `스테이징` as a request to stage files with Git, while the user expected an actual deploy to the Firebase staging environment.
- Root cause: I followed the English Git meaning instead of the project-specific shorthand the user was using repeatedly.
- Lesson: in this workspace, interpret `스테이징` as `commit if needed, push, and deploy to the staging server` unless the user explicitly says `git add` or `stage files`.

### 180. When third-party admin scripts only create CSP source-map noise, prefer a pinned local asset over widening production policy
- Symptom: `/admin.html` showed red CSP errors in DevTools because a CDN-hosted `Chart.js` file triggered a blocked `.map` fetch, even though the chart itself was loading and rendering.
- Root cause: the page depended on an external script whose debugging sidecar request did not match the app's intentionally narrow `connect-src`, and the tempting fix was to broaden CSP just to silence DevTools.
- Lesson: for admin-only libraries that do not need a live CDN dependency, self-host a pinned vendor file and strip the `sourceMappingURL` trailer if needed. Keep CSP focused on real runtime requirements, not DevTools convenience fetches.

### 181. Mobile helper copy should say only the changed behavior, not re-explain the whole feature
- Symptom: the diet-method helper text still felt long on mobile because it explained both the mechanism and the reassurance in full sentences.
- Root cause: I optimized for completeness instead of the phone-sized reading path, so the copy repeated context the surrounding UI already provided.
- Lesson: for compact mobile helper areas, reduce copy to the one changed behavior and one reassurance. Prefer phrases like `바뀌어요`, `그대로예요`, `골라보세요` over full explanatory sentences when the UI already names the feature.

### 182. If a dashboard CTA detours through profile for configuration, the save action should return to the originating surface
- Symptom: tapping `프로필에서 바꾸기` from the dashboard opened the profile selector flow, but after choosing a diet method the user stayed in profile instead of returning to the dashboard context they started from.
- Root cause: I treated the selector as a standalone profile action and did not preserve the entry context for completion.
- Lesson: when a dashboard action opens a settings flow in another tab, carry a lightweight return target through the modal flow and route the user back after a successful save. Only keep the user in the settings tab when they opened the selector there directly.

### 183. For mobile method cards, never concatenate two advisory sentences when one short line can carry the point
- Symptom: diet-method surfaces such as `고단백 식단` still rendered as bulky two-line explanations even after earlier shortening, and narrow badges like `식전 알림 11:30, 17:30` pushed cards into awkward wraps.
- Root cause: I shortened individual sentences but still combined multiple guidance sources and left verbose badge labels in a space-constrained mobile layout.
- Lesson: for mobile selection cards and guide panels, use one short meal cue, one short support line, and a compact badge label like `11:30·17:30`. Avoid stacking multiple advisory sentences unless the user explicitly asks for more detail.

### 185. After splitting a large stylesheet, inspect the first and last lines before shipping
- Symptom: the assets tab lost its orange summary card styling and showed the default white `.card` surface instead.
- Root cause: the stylesheet split left `styles-features.css` with a broken opening comment, which made the first wallet asset rules at the top of the file parse unreliably in the browser.
- Lesson: after moving CSS into a new file, explicitly inspect the first and last lines for broken comment markers or truncated blocks. A one-line parse issue at the file boundary can create a visual regression that looks unrelated to the refactor.

### 186. When a feature adds a new Firestore field, production deploy must include `firestore:rules`, not just hosting/functions
- Symptom: on `2026-04-21`, production users saw `식단 방법 저장 중 문제가 생겼어요.` when selecting a diet method, even though the code and staging environment were already correct.
- Root cause: the diet-program feature started writing `users/{uid}.programPreferences.diet`, but production Firestore rules were still on the `2026-04-07` release that did not allow `programPreferences`. Staging had the newer `2026-04-20` rules, so the bug only survived on production.
- Lesson: when a change depends on a new Firestore field or a rules whitelist update, treat `firestore:rules` as part of the production release contract. After deploy, verify the live Firestore rules release timestamp or contents instead of assuming hosting/function deploys are enough.

### 187. Redirect-based mobile Google login must survive the auth-restore gap without repainting the logged-out shell
- Symptom: Galaxy users could complete Google account selection and then land back on the first login screen as if sign-in had failed.
- Root cause: the Samsung Internet redirect flow cleared its pending-login marker too early, and the logged-out `onAuthStateChanged` branch was allowed to redraw the login modal before redirect auth restoration had fully settled.
- Lesson: for mobile redirect auth, keep a short recovery grace window after return from the provider, suppress the logged-out shell during that window, and only clear the pending-login marker after either auth is restored or the grace window expires.

### 188. When a user gives exact replacement copy for a compact guide slot, remove adaptive progress wording from that slot instead of blending both
- Symptom: the diet method guide in `내 기록` kept adding phrases like `사진 2장 준비됨` even after the user explicitly wanted fixed one-line method descriptions.
- Root cause: I treated the method copy and save-progress feedback as compatible layers inside the same small UI slot, which made the result noisy and ignored the user's requested wording.
- Lesson: if a compact guide area gets exact user-provided copy, keep that slot stable and move any dynamic progress feedback to badges or other supporting UI. Do not prepend `준비됨`, counts, or other adaptive phrases onto the requested sentence.

### 184. Compact diet summaries should show the method name only once and spend the second line on the actual cue
- Symptom: the compact diet summary rendered as `스위치온 다이어트` on the chip and then repeated `스위치온 다이어트 · 초기 저탄수, 이후 균형` on the next line, which wasted space and pushed the meaningful cue down.
- Root cause: I kept the generic `method name + guide` pattern in the status line even after the method label had already moved into the top chip.
- Lesson: when a compact card already has a visible method label, the next line should contain only the actionable cue. If difficulty still matters, fold it into the chip label rather than repeating the method name in the body.

### 189. Redirect-login grace timers must not clear the pending marker just because auth is still restoring
- Symptom: Galaxy users could tap Google login, see the button switch to `로그인 확인 중...`, and still get dropped back to the first screen before sign-in finished.
- Root cause: the earlier fix added a grace concept, but the recovery timer still cleared pending login state after 4 seconds whenever `auth.currentUser` was still null. On mobile redirect flows, that condition is normal during restoration, so the timer was tearing down the protection too early. The marker was also stored only in `sessionStorage`, which is fragile across Samsung/mobile redirect round-trips.
- Lesson: for mobile redirect auth, keep the pending marker in a storage tier that survives browser/app handoff, and only clear it when auth is restored or the full recovery window actually expires. Never treat `auth.currentUser` still being null during the grace window as proof that recovery failed.

### 190. If the user asks to simplify a compact method card, delete the secondary line and promote the whole card as the action
- Symptom: the selected diet-method card still used a second support line such as `가볍게 걷기부터 이어가요.` and a separate `프로필에서 바꾸기` button, which made the small mobile box feel busy.
- Root cause: I kept layering extra reassurance copy and a nested CTA inside a surface whose job had already narrowed to "show the chosen method and let the user change it."
- Lesson: for compact mobile selector summaries, keep one main line of meaning and let the whole card open the selector. If an option is removed from the catalog, map legacy saved values to the nearest surviving option instead of silently dropping users back to `미선택`.

### 191. When a mobile install CTA used to be one-tap, do not fall back to manual instructions until after a short native-prompt wait
- Symptom: tapping `홈 화면에 추가` on mobile sometimes opened install instructions instead of the native PWA install prompt, even on browsers where one-tap install had previously worked.
- Root cause: the CTA checked only whether `beforeinstallprompt` had already been captured at click time. On some Android flows the event arrives slightly later, so the code fell through to manual instructions too aggressively.
- Lesson: for supported Android install surfaces, bridge a short wait for `beforeinstallprompt` before showing manual guidance. Manual instructions are the fallback after native prompt capture has had a fair chance, not the first response to a missing prompt object.

### 192. Push notification routing must target the app shell and the app must understand every focus value it emits
- Symptom: tapping `지금 기록` from meal-time push notifications could appear to do nothing, even though the notification itself arrived correctly.
- Root cause: the service worker picked the first same-origin window, which could be a non-app page like `admin.html`, and the app-side deeplink handler only had a special case for `focus=upload` while reminder notifications were emitting values like `lunch` and `dinner`.
- Lesson: for PWA notifications, prefer an existing app-shell window over arbitrary same-origin clients and pass the destination URL into the running app explicitly. Also keep the app-side deeplink parser in lockstep with every `focus` value emitted by backend notifications.

### 193. When Samsung Internet keeps failing on redirect auth in real use, pivot normal browser tabs back to popup instead of extending the same recovery path again
- Symptom: even after adding persistent pending markers and longer redirect recovery windows, some Galaxy users still looped between Google account selection and the first login screen while `로그인 확인 중...` briefly appeared.
- Root cause: the remaining failures were no longer caused by UI repaint timing alone. On some Samsung Internet browser sessions, the forced redirect path never restored a Firebase user via `getRedirectResult()`, so the app kept re-entering the same dead-end recovery flow.
- Lesson: do not keep reinforcing the same redirect path after repeated real-device failures. For Samsung Internet, use popup login in normal browser tabs and reserve redirect only for narrower contexts that truly need it, such as standalone mode. If redirect ever times out or errors, persist a popup override so the next attempt cannot repeat the same loop.

### 194. In large date-loading functions, normalize the effective selected date once at the top before passing it through new UI helpers
- Symptom: the meditation guide rollout made the sleep/mind tab show `데이터를 불러오는 중 오류가 발생했습니다.` because `loadDataForSelectedDate(...)` called `applyMeditationLogToUi(..., { selectedDateStr })` even though `selectedDateStr` was never declared in that function.
- Root cause: I threaded a new helper call into an existing loader and reused a variable name that existed elsewhere in the file, but I did not create a local normalized date alias inside the function itself.
- Lesson: when a loader receives `dateStr` and multiple downstream calls want a normalized selected date, define `const selectedDateStr = ...` once near the top and use that consistently for doc ids, UI restores, and save helpers. In large shared modules, never assume a similarly named variable already exists in local scope.

### 195. Admin-only reward operations should live in the control tower, not inside member-facing asset flows
- Symptom: the reward-market rollout initially left admin-only recovery actions mixed into the user asset tab and user snapshot payload, even though operators already had a dedicated admin surface.
- Root cause: I optimized for shipping the redeem flow quickly and let operational affordances stay close to the user UI instead of drawing a hard boundary between member actions and operator controls.
- Lesson: when a feature introduces manual review, retries, or ops refresh controls, default those actions to `admin.html` (the control tower) and keep user-facing tabs focused on end-user tasks like redeeming and viewing coupons. If a snapshot or stylesheet exists only to support admin actions, strip it back out of the member flow once the control surface is available.

### 196. Once a UI moves to a new renderer, every event handler must move with it or user input can resurrect the old screen
- Symptom: typing into `쿠폰 수령 연락처` made the reward-market cards lose their product imagery and revert to the earlier plain-card layout.
- Root cause: the main snapshot path had already moved to `renderRewardMarketSnapshot()` / `renderRewardMarketCatalogView()`, but the phone input and save handlers were still calling the older `renderRewardRecipientPhonePanel()` and `renderRewardMarketCatalog()` pair.
- Lesson: after introducing a replacement renderer, grep every interaction handler that mutates the same state and migrate them in the same change. Do not leave mixed old/new render paths wired to the same UI surface.

### 197. Mock reward flows must not consume real balances or live issuance quotas
- Symptom: the reward-market point flow was subtracting points and reducing exchange limits even in `mock` mode, which makes staging coupon tests look like real economic events.
- Root cause: the point-settlement transaction precharged points unconditionally before provider issuance, and the issuance-usage rollup counted every active redemption status regardless of mode or whether the charge was later refunded.
- Lesson: for reward systems with `mock` and `live` modes, charge balances only in `live`, refund any precharge that falls into manual review, and count issuance quotas only from live charged redemptions.

### 198. When duplicate issuance paths share the same ledger write, create the doc ref through one helper instead of re-declaring it ad hoc
- Symptom: tapping `테스트 발급` on staging immediately failed with `쿠폰 교환 처리 중 오류가 발생했습니다.` because the callable crashed on `ReferenceError: reserveLedgerRef is not defined`.
- Root cause: the legacy HBT redemption path still declared `reserveLedgerRef`, but the newer point-settlement path reused the batch write without recreating that ref after a refactor.
- Lesson: when a ledger/doc reference is written in more than one redemption path, create it through a shared helper and add a smoke test for the cheaper path (`mock` in this case). Shared batch writes are easy to break when one branch keeps a local variable and the other silently loses it.

---
## 2026-04-16 (Admin Email Audit Visibility)

### 170. Cold-start Android shells must not rely on a transparent Custom Tab/TWA handoff as the only visible launch path
- Symptom: the installable APK could appear to do nothing when tapped, and on some devices it became awkward to uninstall until the user closed stuck processes.
- Root cause: the launcher stayed visually transparent while it waited for Chrome/TWA handoff, and cold-start browser surfaces could stall or ANR before any visible app UI appeared. That made the shell feel dead even when the process was technically working.
- Lesson: for installable Android shells, give the launcher an immediate visible surface and choose the most reliable browser handoff for the entry point. If share-target or other advanced flows still need TWA, scope TWA to those paths instead of making every cold start depend on a fragile custom-tab bootstrap.

### 171. The app-icon launcher flow should not share the same TWA path as advanced share or verified-link entry points
- Symptom: even after loading-screen and fallback fixes, the installed APK could still feel dead when opened from the home-screen icon or the package installer's `열기` button.
- Root cause: the normal `ACTION_MAIN` / `CATEGORY_LAUNCHER` path was still routed through the same Chrome TWA/custom-tab bootstrap used for trusted share flows, so any browser-side stall in that stack made the whole installed app look broken.
- Lesson: treat the app icon as the simplest and most reliable entry point. Open it through a plain external browser surface, and reserve TWA/custom-tabs for the flows that truly need them, such as share-target handling or trusted deep-link behavior.

### 172. A native-import success toast is not proof that the visible exercise UI kept the imported step count
- Symptom: Health Connect could say `Samsung Health에서 8,765보를 가져왔어요` while the exercise input and ring still showed the older saved value like `6,244`.
- Root cause: the deep-link handler applied the imported steps and showed the toast, but a later `loadStepData()` restore wrote stale Firestore `steps` back into the visible UI during the same session.
- Lesson: for native-to-web handoffs, verify the full render order, not just the event handler that shows success feedback. If saved state can reload after an import, the code needs an explicit precedence rule so the newest in-memory import survives the restore pass.

### 173. Firestore backend timeouts should trigger a shared reconnect backoff, not just a wall of offline warnings
- Symptom: when Cloud Firestore briefly failed to reach the backend, the console filled with follow-on warnings from friendships, onboarding, assets, and token checks, but the app itself had no proactive reconnect behavior beyond the SDK's passive fallback.
- Root cause: retryable connectivity failures were caught piecemeal in feature code and only logged. There was no shared app-level scheduler to retry after short delays or when the tab became visible/online again.
- Lesson: when multiple features can fail from the same Firestore connectivity hiccup, centralize recovery. Add a shared reconnect helper with short backoff steps (for this app, `1s` and `3s`), hook it into the main offline/error catch paths, and keep the feature catches lightweight.

### 174. Asset links readiness checks should treat extra fingerprints as non-blocking unless an exact match is explicitly requested
- Symptom: the Android release-readiness flow reported `assetlinks.json` as failed even though the expected debug fingerprint was present, because the file also contained another valid fingerprint for the same package.
- Root cause: the check treated any additional fingerprint as a blocking mismatch instead of distinguishing between "expected fingerprint missing" and "expected fingerprint present plus extras".
- Lesson: for multi-cert/internal-testing Android setups, readiness checks should require the expected fingerprint set to be present by default and only fail on extra fingerprints in an explicit exact-match mode.

### 175. Hosted APK automation must not silently prefer a stale release artifact without current signing context
- Symptom: the repo could contain an old `app-release.apk` from an earlier environment, which made it possible for hosting prep to serve that artifact even when the current machine had no active release-signing configuration.
- Root cause: artifact selection looked only at file presence, not whether the current environment still had release-signing hints that made the release output trustworthy for this run.
- Lesson: when release and debug artifacts can coexist, prefer the release APK only if current signing hints are present. Otherwise treat stray release files as stale and fall back to the actively reproducible debug artifact.

### 176. Android release-signing docs and Gradle path resolution must agree on the same base directory
- Symptom: release signing looked configured and the keystore file existed under `android/signing/`, but `:app:bundleRelease` still failed with `Keystore file ... android\\app\\signing\\... not found`.
- Root cause: the sample docs and properties used `storeFile=signing/...` as if paths were relative to the Android root, while `android/app/build.gradle.kts` resolved that relative path from the `app` module directory.
- Lesson: if signing examples tell operators to place the keystore under `android/signing/`, the Gradle script must resolve relative `storeFile` values with `rootProject.file(...)`. Do not rely on module-local `file(...)` unless the docs and examples also point to module-local paths.

### 169. Android Browser Helper WebView fallback is not safe unless the fallback activity is declared and exercised
- Symptom: the hybrid app could launch fine when Chrome handled the TWA path, but still died on devices where no compatible TWA browser was available.
- Root cause: I enabled `WEBVIEW_FALLBACK_STRATEGY` in the launcher but did not declare `com.google.androidbrowserhelper.trusted.WebViewFallbackActivity` in `AndroidManifest.xml`. That meant the fallback path itself threw `ActivityNotFoundException` at runtime.
- Lesson: whenever I rely on Android Browser Helper's WebView fallback, I must add the fallback activity to the manifest and verify the path explicitly by disabling the browser/TWA provider during emulator or device QA.

### 168. If the user asks to keep the original app icon, scale or wire the existing asset instead of redesigning it
- Symptom: I responded to an icon sizing complaint by introducing a brand-new launcher illustration, which created a second mismatch: the app no longer looked like Habitschool to the user.
- Root cause: I optimized for visual cleanup instead of respecting the product constraint that the existing icon artwork itself was not up for redesign.
- Lesson: when the request is about icon size, padding, or crop, preserve the original asset and only adjust the adaptive-icon wiring or insets. Do not introduce new launcher art unless the user explicitly asks for a rebrand.

### 167. Never ship an Android install link without launching the built shell at least once on an emulator or device
- Symptom: I published an APK link that installed successfully, but tapping the app immediately failed because the launcher activity crashed before Chrome/TWA could open.
- Root cause: I verified the APK build artifact and signing/assetlinks assumptions, but I did not execute the actual Android launch path. A `LauncherActivity` subclass was calling browser-helper metadata too early and crashed only at runtime.
- Lesson: any time I share an installable Android build, I must complete one real launch on an emulator or device and verify the top activity stays alive. Build success and signature checks are not enough for install-link validation.

### 166. Native surface work must be verified on both footprint and round-trip behavior, not just successful builds
- Symptom: the Android widget shipped with a wider-than-expected footprint, and the in-app `Health Connect에서 가져오기` flow could return without importing steps in the user's actual shell flow.
- Root cause: I treated Android build success and code-path review as sufficient proof, but native UX depends on resource sizing and full deep-link round trips across web -> native -> web.
- Lesson: for Android shell features, verify two separate contracts before calling the work done: the rendered footprint on the launcher/widget grid, and the end-to-end return path from web CTA to native activity back into the web app with the expected payload intact.

### 163. Do not claim an admin UI is visible until the exact surface and entry point are verified in code or the running app
- Symptom: I reported that inactivity email audit details were available, but the user still could not find them from the member-management list.
- Root cause: I confirmed the data plumbing and modal implementation, then overgeneralized that into "the feature is visible" without checking the exact surface the user expected: direct visibility from the list itself rather than only inside a detail modal.
- Lesson: For admin tooling, verify the exact entry point the user named. If the request says "from the members tab," confirm whether the information is visible in the list, in a modal, or behind another click, and describe it precisely before saying the feature is available.

### 164. Sparse audit data should not render empty placeholder cards for every row in an admin list
- Symptom: once inactivity email history was surfaced directly in the member list, every user row showed bulky 3-day / 7-day empty cards even when no email had ever been sent.
- Root cause: I optimized for consistency of structure instead of density of useful information, so absent data got the same visual weight as real audit events.
- Lesson: In admin tables, sparse operational data should default to silence. Show compact summaries only when an event actually exists, and avoid repeating "not sent" placeholders across every row unless the user explicitly needs absence-state auditing.

### 165. Contract-based daily limits must be keyed to the contract's reset window, not the app's local calendar day
- Symptom: before 오전 9시 KST, the assets screen could show the full HBT conversion quota as available, but the onchain mint reverted with `ExceedsUserDailyCap`.
- Root cause: the UI and server pre-check summed successful conversions by KST `date` string, while the contract enforces daily caps by UTC day (`block.timestamp / 86400`), which resets at 오전 9시 KST.
- Lesson: whenever the product surfaces an onchain quota, derive usage from the same timestamp window the contract uses. For UTC-day limits, aggregate by timestamp range, not a local date label, and explicitly show the reset time in the UI.

---
## 2026-04-14 (Dashboard Selected Date Sync)

### 94. Upload-speed improvements must not remove the short synchronous wait that makes saved video thumbnails feel immediate
- Symptom: after the upload-speed refactor, exercise video saves finished faster overall but reopened records and gallery cards often lost their thumbnail for a few seconds.
- Root cause: the new flow stopped waiting for `thumbPromise` during save and pushed thumbnail completion entirely into a later background patch. That improved save latency but regressed the "saved video already has a thumbnail" expectation that the previous flow provided.
- Lesson: when optimizing media-save latency, identify which post-upload artifacts are part of the user's immediate success criteria. For exercise videos, keep a bounded wait for the thumbnail during save, then fall back to background patching only if that short wait still misses.

### 93. Client-generated video thumbnails must be rebound to the final uploaded URL as soon as that URL resolves
- Symptom: even with a persistent local thumbnail cache, saved exercise videos could still reopen with a delayed live-frame fallback when the user saved before local thumbnail extraction finished.
- Root cause: the extracted thumbnail existed, but it was not immediately re-keyed to the final storage URL once the upload resolved. If save happened before `persistSavedExerciseBlock()` saw the local thumb, refresh paths still missed the cache.
- Lesson: when media uploads and client-side thumbnail extraction race each other, store the thumbnail under the final uploaded URL at both rendezvous points: when the thumbnail finishes and when the upload URL finishes. That way either completion order still leaves a refresh-safe cache entry.

### 92. A video thumbnail cache that only lives for the current session is too weak for refresh and gallery recovery
- Symptom: saved exercise videos could still show a placeholder for a few seconds after refresh, then suddenly show a live frame, even though the client had already extracted a usable thumbnail earlier.
- Root cause: the local extracted thumbnail cache only used `sessionStorage`, so refresh and gallery paths could miss it and fall back to slower live-video frame loading whenever `videoThumbUrl` had not been patched yet.
- Lesson: when a client-generated media preview must survive refreshes until the server-side thumb is ready, keep a bounded persistent cache keyed by the final media URL and make every consumer path consult that cache before using a live video fallback.

### 91. When a secondary processing UI keeps destabilizing the core media flow, remove it cleanly if the user prefers the pre-feature behavior
- Symptom: `썸네일 제작중` kept causing repeated regressions across exercise preview, refresh, and gallery/share surfaces even after several condition tweaks.
- Root cause: I continued tuning a non-essential intermediate state instead of recognizing that the safest path was to remove the feature once the user explicitly preferred the old behavior.
- Lesson: when an optional status UI introduces cascading regressions in a core flow and the user asks for rollback, stop layering more guards. Remove the feature end to end, preserve only the underlying persistence fixes that still matter, and return the product to a known-good baseline first.

### 85. When a processing badge lives on a generic upload container, the setter must verify committed media before rendering it
- Symptom: `썸네일 제작중` could still show inside a blank upload box even after the obvious pre-upload toggle was removed.
- Root cause: the pending-state host for static images was the whole `.upload-area`, and `setThumbPendingState()` trusted the incoming `visible` flag without checking whether the slot actually had a committed media URL and visible preview.
- Lesson: for any state mounted on a broad container instead of the media node itself, add a final render-time guard inside the setter. Refuse to show the processing state unless committed media is present and visibly rendered.

### 86. For image-based pending overlays, "visible preview" must mean computed visibility plus actual rendered dimensions
- Symptom: the thumbnail-pending badge could still appear on what looked like an empty slot because the image element technically existed and had saved metadata, but it had not rendered a visible box yet.
- Root cause: checking only saved-url state and a simple `display !== 'none'` test was too weak. An image can still be visually absent while those conditions pass.
- Lesson: when gating UI on whether an image preview is "showing", verify the rendered state with `getComputedStyle(...)`, `offsetWidth`, and `offsetHeight`, not only the presence of the DOM node or saved metadata.

### 87. Do not generalize intermediate media-processing UI across photos and videos when the product need is video-specific
- Symptom: `썸네일 제작중` kept leaking into diet and sleep photo slots even though users already see the original image immediately and only the video path actually benefits from an intermediate poster-generation state.
- Root cause: I treated thumbnail-pending as a generic media concern instead of checking whether the product actually needed that state for each media type.
- Lesson: if the UX problem exists only for video poster generation, scope the state to strength-video uploads only. For photos, show the original image directly and skip extra processing UI altogether.

### 88. When a UI policy is strict, enforce it inside the shared helper instead of relying only on call sites
- Symptom: photo slots could still show the shared thumbnail-pending badge even after several caller-side fixes removed the obvious `visible: true` paths.
- Root cause: the shared helper still allowed any host type, so a missed caller path or stale state could reintroduce the badge outside the intended video-only scope.
- Lesson: when the rule is absolute, put the guard in the shared helper itself. In this case, `setThumbPendingState()` must refuse every non-strength host and clear any leftover badge before returning.

### 89. Replacement uploads must not clear an in-flight pending entry just because the UI is still carrying the previous saved URL
- Symptom: replacing an existing media item and saving while the new upload was still in flight could end with `일부 업로드 실패`, even though the UI preview looked fine.
- Root cause: `persistSavedPreview()` / `persistSavedExerciseBlock()` used the presence of a fallback saved URL as a signal that it was safe to delete `_pendingUploads`. In replacement flows, that fallback URL could belong to the old media while the new upload still had not finished.
- Lesson: when a screen temporarily preserves the old committed URL during replacement upload, only clear the pending entry after the in-flight upload has a matching resolved URL. If the pending upload is unfinished or its resolved URL differs from the currently persisted one, keep the pending entry alive.

### 90. If a local video frame is already visible, treat it as a usable thumbnail and hide "thumbnail pending" UI
- Symptom: the exercise video card could show a clear frame preview while still overlaying `썸네일 제작중`, which felt contradictory and noisy.
- Root cause: the pending logic only looked for a remote `videoThumbUrl` and ignored locally extracted poster frames stored in `data-local-thumb` or already rendered in the preview image.
- Lesson: for video uploads, base the pending UI on user-visible state, not only final remote metadata. If a meaningful local poster frame is already visible, suppress the pending badge and let the remote thumb upload finish silently.

### 84. Secondary processing states should appear only after the user-facing item actually exists, and their styling should stay subordinate
- Symptom: the new `썸네일 제작중` indicator could appear too early, during the pre-upload phase before the saved media was visibly committed, and the badge styling pulled too much attention for what is only an intermediate processing step.
- Root cause: I tied the indicator to the file-transfer lifecycle instead of the committed media lifecycle, and I styled the text like a primary status chip rather than a soft, in-context overlay.
- Lesson: when adding an intermediate processing state, anchor it to the moment the user-facing artifact truly exists in the UI or database. For secondary states like thumbnail generation, prefer subtle blur/overlay treatment over loud badges so the main content remains the focal point.

### 83. Any dashboard summary next to a selected-date control must derive its state from the selected date, not a hidden `todayStr`
- Symptom: the `하나씩 기록` / dashboard hero at the top of `내 기록` kept showing today's score and completion state even after the user changed the date picker to another day.
- Root cause: `loadDataForSelectedDate()` updated the selected document and form state, but the dashboard hero still computed from `getDatesInfo().todayStr` and never re-rendered against the selected day's cached log.
- Lesson: whenever a screen has a selected-date control, audit every adjacent headline and summary card to ensure it reads from the same selected date source. If the form and summary can diverge, re-render the summary after the selected-date load completes and use the selected document cache instead of silently falling back to `today`.

---
## 2026-04-12 (Mainnet Cutover Regression)

### 82. Gallery caches must not replace a previously visible feed item with an incomplete background-upload draft
- Symptom: after saving a new exercise video or sleep image, switching to the gallery could show gray placeholders or even an empty-state message because the app replaced the visible cached item with a document version that still lacked finalized media and thumbnails.
- Root cause: the save flow eagerly upserted `galleryHydrationData` into `cachedGalleryLogs` and also triggered a forced `loadGalleryData(true)` even when media uploads were still finishing in background jobs. That let an incomplete Firestore document override the older, usable gallery state.
- Lesson: when media uploads continue after the main form save, update the record-tab cache immediately but defer gallery-cache replacement until background media reconciliation finishes. Never force-refresh gallery data from Firestore while the current save still depends on unfinished upload/thumbnail patches.

### 76. Dashboard hero summaries should concentrate the main metric near the headline instead of repeating it in lower stat cards
- Symptom: the `오늘의 루틴` card kept feeling busy even after the action rows were improved, because the daily score lived in a separate lower stat box while the top copy still lacked a clear headline-side progress summary.
- Root cause: I treated the hero as "headline plus extra cards" instead of deciding which single metric belongs in the first eye path. That left the top area visually weak and the lower area redundant.
- Lesson: when a dashboard hero has one dominant daily metric like `0/80`, place it directly in the headline summary cluster and remove any duplicate stat boxes beneath it. For mobile product UI, the first scan should answer `what should I do next?` and `how far along am I?` without making the user inspect a second row of cards.

### 77. Adjacent summary panels should be removed once the upstream panel absorbs their job
- Symptom: after the routine hero absorbed action status and daily point progress, the separate `오늘의 인증 현황` card immediately felt unnecessary and made the page look repetitive.
- Root cause: I improved the primary card but left the downstream summary card in place, so the page still repeated the same state in two different visual blocks.
- Lesson: when a top-level dashboard card gains enough clarity to cover a status summary, audit the very next panel and remove it if it no longer introduces new information. Better hierarchy often comes from deleting the second explanation, not decorating it.

### 78. Daily completion UI should use a realistic success threshold, not only the theoretical point maximum
- Symptom: the dashboard still felt discouraging because the routine hero implied users must hit the full 80 points to look "done", even though the real behavior standard is that 65+ points already counts as a successful day.
- Root cause: I tied the hero's visual completion state to the raw category maxima (`30 + 30 + 20`) instead of the product's practical success threshold.
- Lesson: when a habit system has both a theoretical max score and a lower "good enough" completion line, the dashboard should use the practical line for green-complete state, progress percentage, and headline summaries. Keep the per-category raw points visible, but let the success threshold drive the emotional feedback.

### 79. Collapsed dashboard heroes must keep the primary headline and daily score in the always-visible row
- Symptom: even after simplifying the routine hero, the card still felt noisy because the main title lived in the expandable body while the top row showed a small kicker plus a status pill. When the card was collapsed, the most important context disappeared.
- Root cause: I treated the collapsed row as metadata instead of the main summary surface, so the design duplicated information across a kicker, subtitle, points card, and lower copy.
- Lesson: for mobile dashboard heroes with a collapse affordance, the always-visible row should contain the real headline and the single most important metric or status. Supporting copy that does not survive collapse should be removable first.

### 80. Mobile dashboard headlines should fit a strict character budget before visual polish
- Symptom: even after the hero hierarchy improved, the starting headline `식단부터 기록해요` still felt a bit long and visually heavy for the compact top row.
- Root cause: I optimized the structure first but did not re-check whether the actual Korean copy still fit the tighter mobile headline slot.
- Lesson: once a mobile summary row is compressed to a single headline plus one badge, re-evaluate the headline copy with a very short character budget. If the user asks for a tighter phrase, shorten the source label and the fallback/default text together so the UI stays consistent.

### 81. On very small mobile widths, shrink badge chrome before letting a dashboard hero row wrap
- Symptom: the top dashboard row still broke into two lines on mobile because the title, completion badge, and `접기` button competed for space.
- Root cause: I had improved the content hierarchy but left the mobile badge/button padding and min-widths too generous, so the layout wrapped before the typography or chrome adapted.
- Lesson: when a mobile summary row must keep title + status + toggle on one line, first tighten the badge/button padding, font size, and min-widths under small breakpoints. Treat wrapping as the last resort, not the default.

### 75. Compact mobile action chips should be re-composed before adding more badges or metrics
- Symptom: after adding score badges to the dashboard `오늘의 루틴` actions, the three-column mobile chips became cramped and one label wrapped vertically, which made the whole panel feel broken instead of improved.
- Root cause: I preserved the old narrow 3-up chip layout and layered extra numbers onto it without first reconsidering how the content should scan on a phone-width card.
- Lesson: when adding new information to a compact mobile dashboard control, step back and redesign the composition first. Prefer fewer, clearer rows with stable hierarchy over squeezing more badges into an already-tight 3-column strip.

### 74. Integration success UI must not depend on an immediate fresh round-trip if the action itself already succeeded
- Symptom: after a successful Haebit Coach `!연결`, the modal closed and success feedback appeared, but the profile card still said there was no recent connect history until a later reload caught up.
- Root cause: the client wrote `chatbotConnectLastLinkedAt`, then immediately reloaded the user document and trusted that read as authoritative even when it lagged behind the just-completed write. The optimistic success state never got rendered first, so stale data could visually erase the success.
- Lesson: when a user action already succeeded and the client has the new state locally, render that optimistic success immediately and treat the next read as reconciliation. If the follow-up read is older or missing the new timestamp, merge the fresher local state instead of overwriting it.

### 69. Slow onchain wallet history must never block the first render or reuse a false empty state
- Symptom: the wallet `HBT 거래 기록` box could sit empty for ~20 seconds and then suddenly populate, which made users think the feature was broken even though the onchain data eventually arrived.
- Root cause: the client waited for the slow `getHbtTransferHistory` callable before rendering any transaction history, and the static HTML placeholder said "아직 거래 기록이 없습니다" before JavaScript had a chance to reconcile cached or Firestore-backed history.
- Lesson: when a wallet screen combines fast local/app history with slow onchain reconciliation, render in stages. Show cached history immediately, render fast Firestore history first, label the panel as syncing while onchain rows load, and only show a true empty state after every source has completed.

### 70. Pending integration state must not hijack the app's normal first tab
- Symptom: the app could open on `프로필` instead of `내 기록` because a leftover Haebit Coach connect token overrode the normal first-tab selection after sign-in.
- Root cause: the signed-in bootstrap treated any pending chatbot-connect token as a reason to force the `profile` tab, even though the actual connect confirmation can be handled with a modal from any tab.
- Lesson: when an integration has pending state, surface it with a modal, banner, or lightweight prompt first. Do not let unrelated pending flow state replace the product's primary landing tab unless the user explicitly deep-linked there.

### 71. Browser handoff flows need automatic recovery after the first transient failure, not just a passive pending banner
- Symptom: the Haebit Coach `!연결` flow could still feel broken because a Kakao in-app to browser handoff failed once, showed a pending warning, and then stopped progressing unless the user tapped `다시 확인`.
- Root cause: the pending token was preserved, but the recovery path only performed one automatic fetch and then entered a long cooldown on transient errors. That left the user in limbo during exactly the unstable few seconds after browser handoff.
- Lesson: for token handoff flows, keep the pending token and add a few automatic follow-up retries after transient failures. A pending banner is useful, but it should be backup UI, not the only recovery mechanism.

### 72. External integration domains must be added to CSP `connect-src` before relying on browser-side fetch
- Symptom: the Haebit Coach `!연결` flow kept sitting in a pending state even after retry improvements because the browser could not successfully fetch the chatbot API.
- Root cause: hosting CSP allowed Google, Firebase, BSC, and Kakao domains, but it did not include `https://habitchatbot.onrender.com`, so browser fetches to the chatbot server could be blocked at the policy layer.
- Lesson: every time a browser feature talks directly to a new external API, update `firebase.json` CSP `connect-src` in the same change and verify the actual domain is present before debugging retries, tokens, or auth state.

### 73. `!연결` UX must distinguish magic-link completions from fallback registration-code history
- Symptom: after a successful Haebit Coach `!연결`, the profile card could still say `최근 연결 이력은 아직 없어요`, and the modal could show a vague Kakao label like `사용자`.
- Root cause: the app only displayed `chatbotLinkCodeLastUsedAt`, which belongs to the fallback registration-code path, and it trusted the chatbot token display name even when Kakao did not provide a real nickname.
- Lesson: when a product supports both magic-link connect and fallback code connect, store and render separate history for each path. Also treat generic placeholder names like `사용자` as unnamed labels in the UI instead of presenting them as trusted account identity.

### 68. Wallet HBT history must be designed from actual token movement, not only from app-authored Firestore events
- Symptom: the wallet `HBT 거래 기록` box could show challenge stake and conversion rows but still miss direct HBT inflow/outflow that happened onchain, which made the history feel incomplete.
- Root cause: the first pass treated `blockchain_transactions` as the full source of truth even though that collection only logs selected product events and not every ERC-20 transfer affecting the user's wallet.
- Lesson: for wallet asset history, start by enumerating every real balance-changing path. If the product can receive or send HBT outside a narrow app flow, merge app-authored semantic events with onchain token transfer history and dedupe by tx hash instead of assuming Firestore alone is enough.

### 66. App fixes must go to staging first, then only go to prod after explicit user confirmation
- Symptom: some recent fixes were pushed straight to production even though the intended release flow was staging validation first.
- Root cause: I treated a small UI/runtime fix as safe enough for direct production deploy and did not consistently enforce the repo's deployment rule at the release step.
- Lesson: for every hosting/functions change, deploy to staging first, report the staging URL/status, wait for the user's go-ahead, and only then deploy to production. Do not skip the staging hop just because the patch looks small.

### 67. Stable invite codes must be issued server-side once, never regenerated opportunistically on the client
- Symptom: a user's invite link could appear to change because several client-side wallet/auth flows silently generated a fresh `referralCode` whenever the field looked missing or stale.
- Root cause: referral code issuance lived in multiple browser paths instead of a single authoritative server path, and Firestore rules still allowed the client to write `referralCode` directly.
- Lesson: any user-facing identifier that must stay stable should be owned by one server-side ensure/claim path. Clients may request or display it, but they should not mint or overwrite it. When tightening this kind of ownership, remove the field from client-write rules in the same change and verify cache/version bumps so old browser code stops trying legacy writes.

### 65. Transient wallet/challenge toasts need explicit UTF-8 verification before deploy
- Symptom: the challenge application flow briefly showed mojibake during the HBT approval wait state even though most permanent wallet UI text looked correct.
- Root cause: a copied toast string in `js/blockchain-manager.js` contained broken Korean text, and because it only appears during a short-lived approval state it was easy to miss in normal smoke checks.
- Lesson: when changing wallet or challenge flows, verify not only the steady-state screen but also transient toasts, loading messages, approval prompts, and retry warnings in the actual interaction sequence. If any user-facing copy changes, bump the cache/app version in the same fix so stale PWA assets do not preserve the broken text.

### 64. Any flow that stakes onchain before writing Firestore must persist a recovery handle and detect stake drift before allowing retries
- Symptom: a `5000 HBT` weekly challenge start could shrink the wallet by `10000 HBT` when the callable failed after the first successful onchain stake and the user retried the same challenge.
- Root cause: the client submitted `stakeForChallenge()` before the `startChallenge` callable created the Firestore record. When the callable threw a 500, there was no persisted `stakeTxHash` recovery path and no client-side check for unreconciled onchain stake, so a retry could send a second identical stake.
- Lesson: for every challenge-start or similar two-phase flow, 1) persist the successful onchain tx hash locally before the post-tx callable, 2) retry the callable idempotently using that tx hash, 3) compare onchain aggregate stake vs recorded active challenge stake before allowing a new deposit, and 4) do not treat a same-tx retry as a duplicate active challenge on the backend.

### 60. Mainnet cutover must include Functions env, service-worker cache bump, and stale chain-state cleanup together
- Symptom: production wallet copy looked partly updated, but halving progress still showed testnet totals (`49,200`), weekly/master challenge state from testnet kept rendering, and users could keep seeing stale chain-era data after hosting deploys.
- Root cause: hosting switched to mainnet copy, but production callable Functions were still falling back to testnet env defaults, the PWA service worker version lagged behind the app asset version, and legacy `activeChallenges` documents had no chain metadata so they survived the cutover untouched.
- Lesson: for every future chain cutover, treat the release as a 3-part migration: 1) bump app + service-worker cache version together, 2) pin project-specific Functions env files so prod/staging resolve to the intended chain at deploy time, 3) add chain metadata plus cleanup logic for existing Firestore challenge state before calling the rollout complete.

### 61. Wallet asset history and explorer links must resolve through the active chain, not generic contract pages
- Symptom: after the mainnet launch, the wallet tab could still show mixed-chain HBT history, plain contract-address links, and stale `currentRate` wording that made the source of truth harder to verify.
- Root cause: the HBT transaction feed was querying user history without an active-chain filter, the wallet links pointed to generic address pages instead of token-holder views, and cache-busted asset versions were not bumped alongside the wallet UI refresh.
- Lesson: whenever wallet copy or explorer links change, verify 1) HBT history is filtered to the active chain, 2) holder-facing links use the token page with the relevant address parameter, 3) visible wording matches product language (`비율`), and 4) app + service worker versions are bumped together so users actually receive the fix.

### 62. Point history UI must be designed from the real earning sources, not just the most obvious collection
- Symptom: the wallet showed only diet/exercise/mind entries even though users also earn or spend points through reactions, challenge results, admin adjustments, referrals, and bonuses.
- Root cause: the first pass built point history only from `daily_logs.awardedPoints` plus a small subset of blockchain transactions, while several other point flows either live in different collections or are not logged as history at all.
- Lesson: before shipping any wallet history UI, enumerate every `coins` mutation path first. Then separate them into: 1) directly renderable from existing collections, 2) derivable with acceptable queries, 3) impossible to reconstruct because no history is stored. If category 3 exists, call it out and plan a dedicated point-history write path instead of pretending the history is complete.

### 63. Keep helper Cloud Functions narrowly scoped; do not copy challenge-policy logic into unrelated wallet funding flows
- Symptom: wallet gas prefunding failed with a 500 and the client showed `현재 챌린지 보상 정책을 불러오지 못했습니다` even though the user was only trying to get BNB gas.
- Root cause: `prefundWallet` accidentally contained a copied challenge-bonus policy block and referenced `def.tier`, which does not exist in that function. A simple gas top-up path was therefore blocked by unrelated business logic.
- Lesson: for operational helpers like gas prefund, wallet export, or balance checks, keep dependencies minimal and audit for pasted logic before deploy. If a function does not need challenge state or tokenomics policy to do its job, it should not fetch them.

## 2026-04-03

### 59. Cloud Functions?占쎌꽌??`admin.firestore.FieldValue.*`??湲곤옙?吏 留먭퀬 `firebase-admin/firestore`??`FieldValue`占?吏곸젒 ?占쎌빞 ?占쎈떎
- **利앹긽**: `daily_logs`???占?占쎈릺?占쎈뜲 `awardPoints` ?占쎈━嫄곤옙? `Cannot read properties of undefined (reading 'increment')`占?源⑥졇 `users.coins`媛 ?占쎈Ⅴ吏 ?占쎌븯??
- **洹쇰낯 ?占쎌씤**: ???占쎈줈?占쏀듃??emulator/runtime 議고빀?占쎌꽌??`admin.firestore.FieldValue`媛 ??占쏙옙 ?占쎌쟾?占쎄쾶 蹂댁옣?占쏙옙? ?占쎌븯占? ?占쏀엳 Firestore ?占쎈━占??占쏀뻾 ??`increment`, `serverTimestamp`, `delete` ?占쎌텧??以묎컙???占쎌죱??
- **援먰썕**: Cloud Functions?占쎌꽌 Firestore sentinel 媛믪쓣 ???占쎈뒗 `const { FieldValue } = require("firebase-admin/firestore")`占?import?占쎄퀬, 肄붾뱶 ?占쎈컲?占쎌꽌 `FieldValue.increment()`, `FieldValue.serverTimestamp()`, `FieldValue.delete()`泥섎읆 吏곸젒 ?占쎌슜?占쎌빞 ?占쎈떎. ?占쎌씤??蹂댁긽泥섎읆 ?占쎈━占?湲곕컲 ?占쎌쟻 濡쒖쭅?占?emulator 濡쒓렇源뚳옙? 諛섎뱶???占쎌씤???占쎌젣 諛섏쁺??利앸챸?占쎌빞 ?占쎈떎.

## 2026-04-03 (?占쎄퇋 怨꾩젙 濡쒖뺄 ?占??寃占?

### 57. 湲곗〈 怨꾩젙占??占쎌씤?占쎄퀬 ?占쎈궡吏 留먭퀬 ?占쎄퇋 媛??怨꾩젙?占쎈줈???占???占쎈쫫??寃利앺빐???占쎈떎
- **利앹긽**: 湲곗〈 怨꾩젙?占쎌꽌??濡쒖뺄 ?占?占쎌씠 ?占쎈뒗 寃껋쿂??蹂댐옙?吏占? ??怨꾩젙?占쎌꽌??濡쒓렇??吏곹썑 吏占?珥덇린?占쏙옙? `PERMISSION_DENIED`占??占쏀뙣?占쎈떎.
- **洹쇰낯 ?占쎌씤**: `users/{uid}` 洹쒖튃 ?占쎌씠?占쎈━?占쏀듃???占쎌젣 ?占쎄퇋 ?占쎌슜??珥덇린???占쎈뱶(`walletCreatedAt`, `encryptedKey`, `walletIv`, `walletVersion`, `createdAt`)媛 鍮좎졇 ?占쎌뿀??
- **援먰썕**: Auth/?占쎈낫??吏占??占쎌꽦泥섎읆 ?占쎌쿂????踰덈쭔???占??寃쎈줈??湲곗〈 怨꾩젙 ?占쏙옙?留뚯쑝濡쒕뒗 ?占쎌튇?? 濡쒖뺄 寃占?泥댄겕由ъ뒪?占쎌뿉 **?占쎄퇋 媛??怨꾩젙 1???占??*??諛섎뱶???占쏀븿?占쎈떎.

### 58. 濡쒖뺄 emulator占????占쎈뒗 Storage URL 寃利앹씠 ?占쎌쁺 URL占??占쎄낵?占쏀궎吏 ?占쎈뒗吏 ?占쎌씤?占쎌빞 ?占쎈떎
- **利앹긽**: Storage Emulator ?占쎈줈?占쎈뒗 ?占쎄났?占쏙옙?占? ?占?占쎈맂 ?占쎌쭊 URL??`http://127.0.0.1:9199/...` ?占쏀깭??UI媛 ?占쎌쑀?占쏀븯吏 ?占쏙옙? URL?占쎈줈 ?占쎈떒???占쎌쭊??蹂듭썝?占쏙옙? 紐삵뻽??
- **洹쇰낯 ?占쎌씤**: `isValidStorageUrl`?占??占쏙옙? ?占??遺꾩꽍 濡쒖쭅??`firebasestorage.googleapis.com`占??占쎌슜?占쎈룄占??占쎈뱶肄붾뵫???占쎌뿀??
- **援먰썕**: staging/local 寃占??占쎄꼍???占쎌엯?占쎈㈃ URL/?占쎈찓??寃利앸룄 ?占쎄퍡 ?占쎄꼍 ?占쏙옙??占쎌쑝占?諛붽퓭???占쎈떎. Storage/Hosting/Auth URL 寃利앾옙? ?占쎌쁺 ?占쎈찓?占쎈쭔 ?占쎌젣?占쏙옙? 占?占?


## 2026-03-26 (紐⑤컮??踰꾧렇 ?占쎌젙 + ?占쎈뒫 媛쒖꽑 ?占쎌뀡)

### 43. UI 濡쒕뵫 ?占쏀깭??紐⑤뱺 醫낅즺 寃쎈줈(?占쎄났/?占쏀뙣/占??占쎌씠???占쎌꽌 諛섎뱶???占쎌젣?占쎌빞 ?占쎈떎
- **利앹긽**: ??吏占????占쎌펷?占쏀넠??媛???占쎄뎄???占쎌떆?? ?占쎈갑占????占쎌긽(30占?罹먯떆 ?占쏀듃 寃쎈줈 ?占쎌슜).
- **洹쇰낯 ?占쎌씤**: `updateAssetDisplay`??catch 釉붾줉占?`userSnap.exists() === false` 遺꾧린??`hideWalletSkeleton()` ?占쎌텧 ?占쎌쓬.
- **援먰썕**: ?占쎌펷?占쏀넠/濡쒕뵫 UI占?蹂댁뿬二쇰㈃ 諛섎뱶??紐⑤뱺 醫낅즺 寃쎈줈?占쎌꽌 ?占쎌젣??占?
  ?占쎄났 寃쎈줈 ?占쎌뿉 **?占쎈윭 寃쎈줈, 占??占쎌씠??寃쎈줈** 紐⑤몢 ?占쏙옙?. `finally` 釉붾줉 ?占쎌슜 沅뚯옣.

### 44. 釉붾줉泥댁씤/?占쏙옙? 紐⑤뱢 濡쒕뱶?占?Firestore UI ?占쎌씠??濡쒕뱶???占쎌쟾??遺꾨━?占쎌빞 ?占쎈떎
- **利앹긽**: ??吏占???占?濡쒕뵫??20占?嫄몃┝. ethers.js CDN + blockchain-manager + ?占쎌껜???占쎌텧???占쎈즺?占쎌뼱??Firestore 荑쇰━媛 ?占쎌옉?占쎈뒗 援ъ“.
- **援먰썕**: ?占쏙옙? ?占쎌〈??CDN, 釉붾줉泥댁씤 RPC)???占쎌슂???占쎌뾽占??占쎈┰?占쎌씤 ?占쎌뾽(Firestore)???占쎌꽌??臾띰옙? 占?占?
  1. Firestore ?占쎌씠??利됱떆 ?占쎌떆 ???占쎌슜??泥닿컧 濡쒕뵫 1~2占?
  2. 釉붾줉泥댁씤 紐⑤뱢?占?諛깃렇?占쎌슫?占쎌뿉??蹂꾨룄 濡쒕뱶 ???占쎈즺 ???占쎌껜???占쎌씠?占쎈쭔 ?占쎈뜲?占쏀듃

### 45. 媛ㅻ윭占??占쏀꽣???占쎌쭊/?占쎌뒪???占쎈뒗 湲곕줉???占쏀븿?占쎌빞 ?占쎈떎
- **利앹긽**: 媛ㅻ윭占???占쏙옙??"?占쎌쭅 湲곕줉???占쎌뼱?? ?占쎌떆. ?占쎌젣濡쒕뒗 steps(留뚮낫占?, meditationDone(紐낆긽 泥댄겕) 湲곕줉???占쎌쓬.
- **洹쇰낯 ?占쎌씤**: `hasMediaForFilter`媛 ?占쎌쭊 URL, ?占쎌뒪?占쎈쭔 泥댄겕?占쎄퀬 steps.count, meditationDone?占?臾댁떆.
- **援먰썕**: 媛ㅻ윭由ъ뿉 ?占쎌떆??"?占쏙옙? ?占쎈뒗 湲곕줉" ?占쎌쓽占?紐낇솗????占? ?占쎌쭊/?占쎌긽/?占쎌뒪???占쎌뼱???占쎈룞 湲곕줉(嫄몄쓬?? 紐낆긽 泥댄겕)???占쎌쑝占??占쎌떆.

### 46. fetchOnchainBalance ?占쏀뙣 ??0???占쎌떆?占쎈㈃ ???占쎈떎
- **利앹긽**: ??吏占?占?濡쒕뵫 ??HBT媛 "0 HBT"占??占쎄퉸 ?占쎌떆?占쎈떎媛 ?占쏀솗??媛믪쑝占?諛뷂옙?
- **洹쇰낯 ?占쎌씤**: `fetchOnchainBalance` null 諛섑솚 ?占쎈뒗 ?占쎈윭 ??媛뺤젣占?"0 HBT" innerHTML ?占쎌젙.
- **援먰썕**: ?占쏙옙? API ?占쎌텧 ?占쏀뙣/null ?占쎈떟 ??"誘명솗???占쏀깭(議고쉶 占?..)"占??占쏙옙???占? ?占쎌젣 0?占쏙옙? 議고쉶 ?占쏀뙣?占쏙옙? 援щ텇 遺덌옙??占쏀븷 ??0???占쎌떆?占쎈㈃ ?占쎌슜?占쏙옙? ?占쎈룄.

### 47. 鍮꾨룞占?archive ?占쎌닔媛 ?占쏙옙? ?占?占쎌쓣 race condition?占쎈줈 ??占쏙옙?????占쎈떎
- **利앹긽**: 二쇨컙 誘몄뀡???占쎌젙?占쎈룄 ?占쎄씀 ?占쎌젣?? ?占쎈윭 占??占쎌젙?占쎈룄 諛섎났 諛쒖깮.
- **洹쇰낯 ?占쎌씤**: ??占?占?諛⑸Ц ??LS 罹먯떆??吏?占쎌＜ ?占쎌씠?占쎈줈 `archiveWeekAndReset`??鍮꾨룞占??占쏀뻾 ?占쎌옉. ?占쏙옙?媛 誘몄뀡 ?占??`saveWeeklyMissions`)???占쎈즺???占쎌뿉 archive??Firestore `setDoc`???占쎈즺?占쎈ŉ ??誘몄뀡??null占???占쏙옙?占?
  - ?占쎌씠???占쎈룄?? archive ?占쎌옉(?占쎈뜑) ???占쏙옙? ?占????archive Firestore ?占쎄린 ?占쎈즺(null)
- **?占쎌젙**:
  1. `archiveWeekAndReset`: setDoc ??`getDoc`?占쎈줈 ?占쎌옱 weekId ?占쎌씤 ???占쏙옙? ??二쇱감 誘몄뀡?占쎈㈃ null ??占쏙옙?占쎄린 ?占쎈왂
  2. `_archivedWeekIds` Set?占쎈줈 媛숋옙? weekId???占??archive 以묐났 ?占쎌텧 李⑤떒
- **援먰썕**: 鍮꾨룞湲곕줈 諛깃렇?占쎌슫???占쏀뻾?占쎈뒗 "?占쎈━ ?占쎌닔"??諛섎뱶??議곌굔遺 ?占쎄린(read-then-write)占?援ы쁽??占? ?占쏙옙? ?占쎌뀡??癒쇽옙? ?占쎈즺?占쎌쓣 媛?占쎌꽦????占쏙옙 怨좊젮?占쎌빞 ?占쎈떎.

### 48. PIL?占쎌꽌 ?占쎄뎅???占쏀듃 ?占쎈뜑占???malgun.ttf(?占쎈컲占????占쎌젙 湲?占쏙옙? 源⑤쑉由곕떎
- **利앹긽**: feature-graphic ?占쏙옙?吏?占쎌꽌 "占? 湲?占쏙옙? ?占쎌긽?占쎄쾶 ?占쎈뜑留곷맖.
- **洹쇰낯 ?占쎌씤**: `malgun.ttf`(?占쎈컲占????占쎌젙 ?占쎄린(22~26px)?占쎌꽌 "占? ???占쏙옙? ?占쎄뎅??湲?占쏙옙? ?占쎈せ ?占쎈뜑占? `malgunbd.ttf`(援듸옙?占????占쎌씪 ?占쎄린?占쎌꽌 ?占쎌긽 ?占쎈뜑占?
- **援먰썕**: Windows PIL ?占쏙옙?吏 ?占쎌꽦?占쎌꽌 ?占쎄뎅???占쎌뒪?占쎈뒗 `malgunbd.ttf`(援듸옙?占?占?湲곕낯?占쎈줈 ?占쎌슜??占? ?占쎈컲占??占쎌슜 ???占쎌씠利덈퀎占?湲??源⑥쭚 ?占쏙옙? 諛섎뱶???占쎌씤.

---

## 2026-03-25 (紐⑤컮??媛ㅻ윭占?踰꾧렇 ?占쎌젙 ?占쎌뀡 #2)

### 37. async ?占쎌닔 ??try/catch 諛붽묑??await???占쎌펷?占쏀넠 怨좎갑???占쎈컻?占쎈떎
- **利앹긽**: 媛ㅻ윭占???占쏙옙 媛???占쎌펷?占쏀넠(?占쎌깋 ?占쎈젅?占쎌뒪?占?? ?占쏀깭?占쎌꽌 硫덉떠 ?占쎌씠?占쏙옙? ?占쎌떆?占쏙옙? ?占쎌쓬.
- **洹쇰낯 ?占쎌씤**: `_loadGalleryDataInner()`?占쎌꽌 ?占쎌펷?占쏀넠??蹂댁뿬以 吏곹썑 `getDoc()` ?占쎌텧??try/catch 諛붽묑???占쎌튂.
  Firestore ?占쎄껐 遺덉븞?????占쎈떦 `await`?占쎌꽌 throw ???占쎌닔 醫낅즺 ???占쎌펷?占쏀넠??DOM???占쎄뎄 ?占쎈쪟.
- **援먰썕**:
  1. ?占쎌펷?占쏀넠/濡쒕뵫 UI占?蹂댁뿬以 ?占쏀썑??紐⑤뱺 async ?占쎌뾽?占??占쎌쇅 ?占쎌씠 try/catch占?蹂댄샇.
  2. 以묒슂??鍮꾨룞占??占쎌닔 ?占쎌껜占?理쒖긽??try/catch占??占쏀븨???占쎌쟾占?援ъ텞. ?占쎈뼡 ?占쎌쇅??濡쒕뵫 ?占쏀깭占?怨좎갑?占쏀궎占?????
  3. "蹂댁“ ?占쎌씠??(移쒓뎄 紐⑸줉 ?? ?占쏀뙣??臾댁떆?占쎄퀬 硫붿씤 ?占쎌씠???占쎈뜑留곻옙? 怨꾩냽 吏꾪뻾.

### 38. 媛숋옙? 湲곕뒫??????占쏙옙 ?占쎌쑝占??占쎌옄?占쎌쓣 諛섎뱶???占쎌튂?占쎌폒???占쎈떎
- **利앹긽**: ?占쎌궛 ??移쒓뎄 珥덌옙? 諛뺤뒪媛 ?占쎈줈????占쏙옙 ?占쎈Ⅸ ?占쎌옄??踰꾪듉 ?占쏙옙??? 珥덌옙? 肄붾뱶 ?占쎌떆 ?占쎌쓬).
- **援먰썕**: ?占쎌씪??湲곕뒫 而댄룷?占쏀듃媛 ??占??占쎌긽???占쎌쓣 ??
  1. ??怨녹쓣 ?占쎌젙?占쎈㈃ ?占쎈㉧吏??諛섎뱶???占쎄린??
  2. 媛?占쏀븯占?怨듯넻 ?占쎌닔/HTML ?占쏀뵆由우쑝占?異붿텧???占쎌씪 ?占쎌뒪 ?占쏙옙?.
  3. ?占쎄퇋 湲곕뒫(珥덌옙? 肄붾뱶 ?占쎌떆 ?? 異뷂옙? ??紐⑤뱺 吏꾩엯?占쎌뿉 ?占쎌떆 諛섏쁺.

---

## 2026-03-25 (而ㅿ옙??占쏀떚 ?占쎌꽦??+ 珥덌옙? ?占쎌뒪???占쎌뀡)

### 35. Firestore rules 蹂寃쏙옙? git commit留뚯쑝濡쒕뒗 ???占쎈떎 ??firebase deploy ?占쎌닔
- **利앹긽**: `isAllowedUserField()`??`referralCode` 異뷂옙? ??commit/push ?占쏙옙?占??占쎌젣 Firestore???占쎌쟾??沅뚰븳 嫄곤옙?.
- **援먰썕**: Firestore rules, Storage rules 蹂寃쏙옙? 諛섎뱶??`firebase deploy --only firestore:rules` (?占쎈뒗 `storage`) 蹂꾨룄 ?占쏀뻾 ?占쎌슂.
  git commit?占?肄붾뱶 ?占?占쎌씪 占? 洹쒖튃 諛섏쁺?占?firebase deploy媛 ?占쎌빞 ??
- **泥댄겕由ъ뒪??異뷂옙?**: ??Firestore ?占쎈뱶 異뷂옙? ??rules ?占쎌씠?占쎈━?占쏀듃 異뷂옙? ??**firebase deploy --only firestore:rules** ?占쏀븿?占쎌꽌 諛고룷

### 36. try/catch 踰붿쐞占?理쒖냼?占쏀븷 占???愿???占쎈뒗 肄붾뱶占?媛숋옙? catch??臾띰옙? 占?占?
- **利앹긽**: 蹂듯샇???占쎄났 ??`updateDoc(referralCode)` ?占쏀뙣媛 "v2 吏占?蹂듯샇???占쏀뙣"占??占쎈せ 濡쒓퉭??
  ?占쎌슜?占쎌뿉寃뚮뒗 蹂듯샇???占쎈윭占??占쏀빐?????占쎄퀬, referralCode ?占???占쏀뙣??議곗슜??臾삵옒.
- **援먰썕**: try/catch 釉붾줉?占?紐⑹쟻蹂꾨줈 遺꾨━??占?
  蹂듯샇??濡쒖쭅 ??蹂듯샇???占쎌슜 catch. ?占??濡쒖쭅 ???占???占쎌슜 catch.
  ?占쎈줈 ?占쎈Ⅸ ?占쏀뙣 耳?占쎌뒪占?媛숋옙? catch??臾띠쑝占??占쎈윭 吏꾨떒??遺덌옙??占쏀빐占?

---

## 2026-03-22 (嫄몄쓬??湲곕뒫 異뷂옙? & 媛ㅻ윭占?吏???占쎌젙 ?占쎌뀡)

### 29. Gemini 紐⑤뜽: gemini-2.0-flash ?占쎌슜 湲덌옙? ??諛섎뱶??gemini-2.5-flash占??占쎌슜
- **利앹긽**: `gemini-2.0-flash` 紐⑤뜽??deprecated?占쎌뼱 Cloud Function?占쎌꽌 404 ?占쎈윭 諛쒖깮.
- **援먰썕**: **gemini-2.0-flash???占쏙옙? ?占쎌슜?占쏙옙? 占?占?** 紐⑤뱺 Gemini API ?占쎌텧?占?`gemini-2.5-flash`占??占쎌슜.
  ?占쎌닚 OCR ??thinking??遺덊븘?占쏀븳 ?占쎌뾽?占?`thinkingConfig: { thinkingBudget: 0 }`?占쎈줈 thinking 鍮꾪솢?占쏀솕.

### 30. 諛고룷 ?占쎌꽌: 諛섎뱶??git commit ??push ???占쎌슜???占쎌씤 ??firebase deploy
- **利앹긽**: 肄붾뱶 蹂占???諛붾줈 `firebase deploy`?占쎌뿬 寃利앸릺吏 ?占쏙옙? 肄붾뱶媛 ?占쎈줈?占쎌뀡??諛고룷??
  Storage 洹쒖튃 ?占쎈씫, SDK 踰꾩쟾 遺덉씪占? 紐⑤뜽 deprecated ???占쎌뇙 ?占쎈윭 諛쒖깮.
- **援먰썕**: ?占쎈쾭 諛고룷 ?占쎌꽌占?諛섎뱶??吏??占?
  1. `git add` + `git commit`
  2. `git push origin main`
  3. **?占쎌슜?占쎌뿉占??占쎌씤 ?占쎌껌**
  4. ?占쎌씤 諛쏉옙? ?占쎌뿉占?`firebase deploy --only hosting,functions`
- **?占쏙옙? 湲덌옙?**: ?占쎌슜???占쎌씤 ?占쎌씠 `firebase deploy` ?占쏀뻾.

### 31. Firebase Storage 蹂댁븞 洹쒖튃????寃쎈줈 異뷂옙?占??占쏙옙? 占?占?
- **利앹긽**: `step_screenshots/` 寃쎈줈媛 `storage.rules`???占쎌뼱???占쎈줈????403 Forbidden ?占쎈윭.
- **援먰썕**: ?占쎈줈??Storage 寃쎈줈占?肄붾뱶??異뷂옙?????諛섎뱶??`storage.rules`?占쎈룄 ?占쎈떦 寃쎈줈 洹쒖튃 異뷂옙?.
  `firestore.rules` (Lesson #6)占??占쎌씪???占쏀꽩. **泥댄겕由ъ뒪?占쎌뿉 異뷂옙?.**

### 32. Firebase SDK 踰꾩쟾?占??占쎈줈?占쏀듃 ?占쎌껜?占쎌꽌 諛섎뱶???占쎌씪
- **利앹긽**: ???占쎌껜??`firebase 10.8.0`?占쎈뜲 嫄몄쓬??肄붾뱶?占쎌꽌 `11.6.0`???占쎌쟻 import.
  ?占쎈줈 ?占쎈Ⅸ 踰꾩쟾??SDK??Firebase ???占쎌뒪?占쎌뒪占?怨듭쑀?占쏙옙? 紐삵빐 ?占쎈줈?占쏙옙? 臾댄븳 ?占쏙옙?hang).
- **援먰썕**: ?占쎌쟻 import占?Firebase SDK占??占쎈줈 濡쒕뱶?占쏙옙? 占?占?
  ?占쏙옙? top-level?占쎌꽌 import??紐⑤뱢(`ref`, `uploadBytes`, `getDownloadURL` ????吏곸젒 ?占쎌슜.
  ??Firebase 紐⑤뱢???占쎌슂?占쎈㈃ 湲곗〈 import 釉붾줉??異뷂옙?.

### 33. canvas.toBlob()?占?null??諛섑솚?????占쎈떎 ??諛섎뱶??null 泥댄겕
- **利앹긽**: `compressImage`?占쎌꽌 `canvas.toBlob()` 肄쒕갚??`blob`??null?占쎌뿀占?
  `blob.size` ?占쎄렐 ??TypeError 諛쒖깮. Promise媛 resolve??reject?????占쎌뼱 ?占쎌껜 hang.
- **援먰썕**: `canvas.toBlob()` 肄쒕갚?占쎌꽌 `blob`??null??寃쎌슦 ?占쎈낯 ?占쎌씪占?fallback.
  Promise ?占쏙옙??占쎌꽌??紐⑤뱺 寃쎈줈媛 resolve ?占쎈뒗 reject???占쎈떖?占쎈뒗吏 諛섎뱶???占쎌씤.

### 84. 날짜 기반 보상 제한은 클라이언트 문구와 서버 지급을 함께 잠글 것
- **증상**: 오래된 날짜에 대한 무포인트 정책을 UI helper만 바꾸면, 저장 데이터나 Cloud Function 지급 경로를 통해 여전히 포인트가 올라갈 수 있다.
- **교훈**: 날짜 cutoff 규칙은
  1. 저장 버튼 문구/CTA,
  2. 클라이언트 저장 시 `awardedPoints` 증가분 차단,
  3. 서버 `awardPoints` 지급 차단
  를 같은 기준으로 함께 반영해야 한다.
- **규칙**: “특정 날짜엔 보상 제외” 정책은 항상 client + backend 이중 적용으로 넣고, 이미 받은 과거 포인트는 유지하되 새 증가만 막는다.

### 85. 미디어 날짜 검증은 메타데이터 신뢰도에 따라 다르게 다뤄야 한다
- **증상**: 사진/영상 날짜 검증을 모두 같은 강도로 막으면, EXIF가 없는 캡처나 메신저/편집 앱을 거친 파일까지 정상 업로드가 막힐 수 있다.
- **교훈**: 날짜 메타데이터가 있는 사진(EXIF)은 신뢰도가 높으므로 불일치 시 엄격하게 차단하고, EXIF가 없는 사진이나 영상처럼 파일 시각만 남는 경우는 경고 후 예외 허용이 더 현실적이다.
- **규칙**: 사진 날짜 정책을 손볼 때는 `EXIF 있음 = 차단`, `EXIF 없음/영상 = 확인 후 허용` 순서로 설계하고, 수동 업로드와 여러 장 자동 가져오기 흐름을 같은 기준으로 맞춘다.

### 86. 세션 마감 전에는 코드뿐 아니라 작업 문서도 working tree 기준으로 정리할 것
- **증상**: staging이나 배포는 끝났는데 `tasks/` 아래 로컬 메모가 untracked로 남아 있으면, 사용자는 아직 안 올라간 파일이 있다고 느끼고 마감 상태가 흐려진다.
- **교훈**: 이 저장소에서는 task note도 작업 산출물의 일부다. 마감 전에 `git status`를 보고 남아 있는 문서가 의도된 미추적인지, 정리해야 할 기록인지 구분해야 한다.
- **규칙**: “오늘 작업 여기까지”나 “문서까지 깔끔하게 정리” 요청이 오면, 마지막 단계에서 반드시 `git status --short`로 문서 흔적까지 확인하고 필요한 task note를 commit 범위에 포함한다.

### 34. ?占쎌뾽 ?占쎈즺 ??諛섎뱶???占쎈윭 寃占???硫댐옙???遺꾩꽍 ??諛고룷
- **利앹긽**: 湲곕뒫 援ы쁽 ???占쎌뒪???占쎌씠 "?占쎈즺"占?蹂닿퀬. Storage 洹쒖튃 ?占쎈씫, SDK 踰꾩쟾 遺덉씪占?
  紐⑤뜽 deprecated ??3占??占쎌뇙 ?占쎈윭媛 ?占쎌슜?占쎌뿉占?洹몌옙?占??占쎌텧??
- **援먰썕**: ?占쎌뾽 ?占쎈즺 ??諛섎뱶??
  1. 肄붾뱶 蹂寃쎌씠 ?占쎌〈?占쎈뒗 紐⑤뱺 ?占쏀봽??Storage rules, Firestore rules, CF 諛고룷) ?占쏙옙?
  2. ??import/寃쎈줈 異뷂옙? ??湲곗〈 踰꾩쟾/洹쒖튃占?異⑸룎 ?占쎈뒗吏 ?占쎌씤
  3. ?占쎌닚?占쎄쾶 ?占쎄컖?占쏙옙? 留먭퀬 硫댐옙??占쎄쾶 遺꾩꽍 ??諛고룷
  4. ?占쎈윭 諛쒖깮 ??洹쇰낯 ?占쎌씤源뚳옙? ?占쎈꼍???占쎄껐

---

## 2026-03-20 (肄붾뱶 由щ럭 & ?占쏀봽???占쎈━ ?占쎌뀡)

### 20. ?占쎌껜 肄붾뱶 由щ럭???占쎄꺼占?踰꾧렇占??占쎄볼踰덉뿉 ?占쎈윭?占쎈떎
- `/octo:review`占????占쎌껜占?泥닿퀎?占쎌쑝占??占쎌깋?占쎈땲 ?占쎈컻???占쎌뾽 占??占쎌낀??踰꾧렇 7媛쒙옙? ???占쎌뀡??諛쒓껄??
- **援먰썕**: 湲곕뒫 媛쒕컻???占쎈뒓 ?占쎈룄 ?占쎌젙?占쎈㈃ 二쇨린?占쎌쑝占??占쎌껜 肄붾뱶 由щ럭占??占쏀뻾??占? ?占쎌씪 ?占쎌쐞 寃?占쎈낫???占쏀궎?占쎌쿂 ?占쏙옙? ?占쎄컖?占쎌꽌 蹂대㈃ ?占쎈Ⅸ 踰꾧렇媛 蹂댁씤??

### 21. UI??鍮꾩쑉???占쎈뱶肄붾뵫?占쎈㈃ Phase 蹂占????占쎌슜?占쏙옙? 湲곕쭔?占쎈떎
- `main.js`?占쎌꽌 HBT 蹂??誘몃━蹂닿린媛 `const hbt = amount; // Era A: 1:1`占?怨좎젙?占쎌뼱 ?占쎌뿀??
- Phase 2(35M HBT ?占쎌쟻) 吏꾩엯 ???占쎌슜?占쎈뒗 "100P ??100 HBT"占?蹂댐옙?占??占쎌젣濡쒕뒗 50 HBT占??占쎈졊
- **援먰썕**: ?占쎌껜???占쎈쾭?占쎌꽌 寃곗젙?占쎈뒗 占?鍮꾩쑉, ?占쎈룄, ?占쏙옙?)??UI???占쏙옙? ?占쎈뱶肄붾뵫?占쏙옙? 占?占?
  濡쒕뱶 ??API占?媛?占쏙옙? 罹먯떆?占쎄퀬(`window._currentConversionRate`), UI??罹먯떆??媛믪쓣 ?占쎌슜.

### 22. ?占쏀깭 ?占쎌궛占?accumulator)??諛섎뱶??由ъ뀑 ?占쎌젏??紐낇솗???占쎌쓽?占쎌빞 ?占쎈떎
- `_stakePctAccum`??梨뚮┛吏 ?占쎈꼸 ?占쎄린/?占쎄린 ?占쎌씠??由ъ뀑?占쏙옙? ?占쎌븘 ?占쎌쟾 ?占쎈룄??% 媛믪씠 ?占쎈쪟
- **援먰썕**: ?占쎌궛 ?占쏀깭??珥덇린???占쎈━嫄곤옙? 紐낆떆?占쎌쑝占??占쎄퀎??占? "?占쎌젣 由ъ뀑?占쎈뒗媛?"占?肄붾뱶 二쇱꽍?占쎈줈 臾몄꽌??

### 23. CDN ?占쎌쟻 濡쒕뱶??SRI(Subresource Integrity) ?占쎌쑝占?怨듦툒占?怨듦꺽??臾대갑占?
- `_loadScript(url)` ?占쏀꽩?占쎈줈 exif-js, html2canvas, ethers.js占?濡쒕뱶????`integrity` ?占쎌꽦 ?占쎌쓬
- CDN ?占쎈쾭 移⑦빐 ???占쎌꽦 JS媛 ?占쎌슜??釉뚮씪?占쏙옙??占쎌꽌 ?占쏀뻾 媛??
- **援먰썕**: CDN ?占쏀겕由쏀듃 ?占쎌쟻 濡쒕뱶 ??`integrity` + `crossOrigin = 'anonymous'` ?占쎌닔.
  `_loadScript(url, integrity, crossOrigin)` ?占쎄렇?占쎌쿂占??占쎌옣?占쎌뿬 媛뺤젣??
  SRI ?占쎌떆??cdnjs API ?占쎈뒗 `curl <url> | openssl dgst -sha512 -binary | openssl base64 -A`占?怨꾩궛.

### 24. 踰꾩쟾 誘멸퀬??CDN URL?占?議곗슜???占쏀븳??占쏙옙
- `https://cdn.jsdelivr.net/npm/exif-js`泥섎읆 踰꾩쟾 ?占쎌씠 濡쒕뱶?占쎈㈃ CDN??理쒖떊 踰꾩쟾???占쎌쓽占??占쎈튃
- ?占쎌씠釉뚮윭占?硫붿씠?占??占쎈뜲?占쏀듃 ??API 蹂寃쎌쑝占??占쎌씠 議곗슜??源⑥쭏 ???占쎌쓬
- **援먰썕**: CDN URL?占쎈뒗 諛섎뱶??踰꾩쟾 怨좎젙 (`@2.3.0`). SRI ?占쎌떆?占??占쎄퍡 ?占쎌슜?占쎈㈃ ?占쎌쨷 蹂댄샇.

### 25. dist/ ?占쎈뜑??諛고룷 ?占쎈왂???占쎌젙?占쎈㈃ 怨쇨컧???占쎄굅?占쎈씪
- ?占쎌뒪???占쎈쾭 = GitHub, 蹂몄꽌占?= Firebase 吏곸젒 諛고룷 援ъ“?占쎌꽌 dist/??遺덊븘?占쏀븳 蹂듭궗占?
- dist/ ?占쏙옙? ????占쏙옙 ?占쎈룞 ?占쎄린?占쏙옙? ?占쎌슂??Lessons #5, #8 媛숋옙? ?占쎌닔媛 諛섎났??
- **援먰썕**: 諛고룷 援ъ“ ?占쎌젙 ??以묎컙 ?占쎌텧占?dist/)?占?git?占쎌꽌 ?占쎄굅?占쎄퀬 `.gitignore`??異뷂옙?.
  `git rm --cached -r dist/`占?異붿쟻占??占쎄굅 (?占쎌씪 ??占쏙옙 ?占쎌쓬), ?占쏀썑 `git pull`??臾쇰━ ?占쎌씪???占쎈━.

### 26. .firebaserc ?占쎌쑝占?諛고룷???占쎈쭏??--project ?占쎈옒洹몌옙? ?占쎈젰?占쎌빞 ?占쎈떎
- 占?`firebase deploy` 留덈떎 `--project habitschool-8497b`占?遺숈뿬???占쎌쓬 (Lesson #4 ?占쎌젣 ?占쎄껐)
- **援먰썕**: ?占쎈줈?占쏀듃 猷⑦듃??`.firebaserc` ?占쎌씪 ?占쎌꽦 ??湲곕낯 ?占쎈줈?占쏀듃 ?占쎈줉. 而ㅻ컠?占쎌꽌 ?占?怨듭쑀.
  ```json
  { "projects": { "default": "habitschool-8497b" } }
  ```

### 27. git worktree ?占쎌슜 ??硫붿씤 ?占쎈뜑???占쎈룞 ?占쎄린?占쎈릺吏 ?占쎈뒗??
- ?占쏀겕?占쎈━(`worktrees/frosty-mclean/`)?占쎌꽌 `main`??push?占쎈룄 `habitschool/`?占?洹몌옙?占?
- **援먰썕**: `main` push ?占쎈즺 ??諛섎뱶??硫붿씤 ?占쎈뜑?占쎌꽌 pull:
  ```
  cd D:\antigravity\habitschool && git pull origin main
  ```

### 28. deprecated API??諛쒓껄 利됱떆 ?占쎄굅?占쎈떎 ???占쎌쨷?占??占쎈떎
- `document.execCommand('copy')`媛 copyWalletAddress fallback???占쎌븘 ?占쎌뿀??(?占쏙옙? deprecated)
- **援먰썕**: deprecated 寃쎄퀬媛 諛쒖깮?占쎈뒗 API??占??占쎌뀡??諛붾줈 ?占쎄굅. fallback???占쎌쑝占?toast/alert占??占쎌슜?占쎌뿉占??占쎈궡.

---

## 2026-03-16 (?占쎈뒫 理쒖쟻??& ?占쎌젙???占쎌뀡)

### 13. Service Worker Cache First ??Network First ?占쏀솚???占쎌닔?占쎌씤 寃쎌슦
- **利앹긽**: ?占쏀겕占???占쏙옙??3占? ?占쎈컲 ?占쎈＼?占쎌꽌 33占? 肄붾뱶占??占쎈Т占??占쎌젙?占쎈룄 ?占쎈컲 ?占쎈＼?占쎌꽌 ?占쎈룄 媛쒖꽑 ?占쎌쓬.
- **洹쇰낯 ?占쎌씤**: 占?Service Worker媛 Cache First ?占쎈왂?占쎈줈 ?占쎈옒??JS ?占쎌씪??罹먯떆?占쎌꽌 ?占쎈튃.
- **?占쎄껐**: SW占?Network First ?占쎈왂?占쎈줈 蹂占?+ `skipWaiting()` + `clients.claim()` 利됱떆 ?占쎌꽦??
- **?占쎈컻 諛⑼옙?**:
  1. SW??諛섎뱶??**Network First** ?占쎈왂 ?占쏙옙?. Cache First占??占쏙옙? ?占쎈룎由э옙? 占?占?
  2. JS/CSS ?占쎌젙 ??`CACHE_NAME` 踰꾩쟾 踰덊샇 利앾옙? ?占쎌닔.
  3. `install`?占쎌꽌 `self.skipWaiting()`, `activate`?占쎌꽌 `self.clients.claim()` 諛섎뱶???占쏀븿.
  4. 諛고룷 ??"?占쏀겕占???vs ?占쎈컲 ?? ?占쎈룄 鍮꾧탳占?SW 臾몄젣 媛먮퀎.

### 14. CDN ?占쏀겕由쏀듃??珥덇린 濡쒕뵫??二쎌씤??
- **利앹긽**: index.html??ethers(800KB), exif, html2canvas, kakao ??CDN ?占쏀겕由쏀듃媛 `defer`占?濡쒕뱶?占쏙옙?占?紐⑤컮?占쎌뿉????占??占쎈え.
- **?占쎄껐**: 紐⑤뱺 CDN ?占쏀겕由쏀듃占??占쎄굅?占쎄퀬 **?占쎌슜 ?占쎌젏???占쎌쟻 濡쒕뱶** (`_loadScript` ?占쏀꽩).
- **?占쎈컻 諛⑼옙?**:
  1. index.html?????占쏙옙? ?占쏀겕由쏀듃 異뷂옙? 湲덌옙?. 諛섎뱶???占쎌쟻 import ?占쎈뒗 `_loadScript()` ?占쎌슜.
  2. ???占쎌씠釉뚮윭占?異뷂옙? ?? "?占?占쎈낫??占??占쎈뜑???占쎌슂?占쏙옙??" ??No占?lazy load.

### 15. ?占쎌쟻 ?占쏀겕由쏀듃 濡쒕뱶 ?占쎌꽌: ?占쎌〈??泥댁씤 以??
- **利앹긽**: `ethers is not defined` ?占쎈윭.
- **?占쎄껐**: `_loadBlockchainModule()`?占쎌꽌 ethers.js CDN 癒쇽옙? 濡쒕뱶 ??`blockchain-manager.js` import.
- **?占쎈컻 諛⑼옙?**: `loadA().then(() => import(B))` ?占쏀꽩?占쎈줈 ?占쎌〈???占쎌꽌 紐낆떆??愿占?

### 16. 紐⑤컮??濡쒓렇????window.location.reload()???占쎌닔
- **利앹긽**: reload() ?占쎄굅 ??Firestore 荑쇰━媛 30占??占쎌긽 ?占쏙옙? ?占쎌씠??誘명몴??
- **援먰썕**: `window.location.reload()`占??占쎈뒫 ?占쎌쑀占??占쎄굅?占쏙옙? 占?占? auth.js??`_isPopupLogin` + reload ?占쏀꽩?占?嫄대뱶由э옙? 占?占?

### 17. onAuthStateChanged?占쎌꽌 loadDataForSelectedDate ?占쎌텧 ?占쎌닔
- **援먰썕**: `onAuthStateChanged` 濡쒓렇??泥섎━?占쎌꽌 `loadDataForSelectedDate` ?占쎌텧???占쎄굅?占쏙옙? 占?占?

### 18. Cloud Function Cold Start ?占?? ?占?占쎌븘??+ ?占쎈갚
- **?占쎄껐**: CF ?占쎌텧??5占??占?占쎌븘???占쎌슜. ?占?占쎌븘????吏곸젒 Firestore 荑쇰━占??占쎈갚.
- **?占쏀꽩**: `Promise.race([cfPromise, timeoutPromise]).catch(() => directFirestore())`

### 19. "?占쏀겕占???vs ?占쎈컲 ?? 鍮꾧탳??理쒓컯 ?占쎈쾭占??占쎄뎄
- ?占쏀겕占??占쎌긽, ?占쎈컲=鍮꾩젙????**Service Worker ?占쎈뒗 釉뚮씪?占쏙옙? 罹먯떆 臾몄젣 ?占쎌젙**.
- DevTools ??Application ??Service Workers?占쎌꽌 ?占쎌꽦 SW 踰꾩쟾 ?占쎌씤.

### 12. ?占?占쎈낫??罹먯떆 臾댄슚?????占쎈㈃ 誘몄뀡 ?占쎌꽕?占쎌씠 諛섏쁺 ????
- **援먰썕**: Firestore ?占쎌씠??蹂占???`renderDashboard()` ?占쎌텧 ??`_dashboardCache` 珥덇린???占쎌닔.

### 11. authDomain?占??占쏙옙? hosting ?占쎈찓?占쎌쑝占?諛붽씀占?????
- **援먰썕**: authDomain?占???占쏙옙 `habitschool-8497b.firebaseapp.com` ?占쏙옙?. `habitschool.web.app`?占쎈줈 諛붽씀占?Android PWA 濡쒓렇??瑗ъ엫.

### 10. 濡쒓렇?占쏙옙? 諛섎뱶??signInWithPopup ??signInWithRedirect 湲덌옙?
- **援먰썕**: `signInWithRedirect`?????占쎈줈?占쏀듃?占쎌꽌 ?占쎈룞?占쏙옙? ?占쎌쓬. `popup-closed-by-user` ?占쎈윭??議곗슜??臾댁떆.

### 9. JS/CSS ?占쎌젙 ??sw.js CACHE_NAME 踰꾩쟾 踰덊샇 利앾옙? ?占쎌닔
- **援먰썕**: SW `CACHE_NAME` 踰꾩쟾??媛숈쑝占??占쎌슜??釉뚮씪?占쏙옙?????罹먯떆媛 怨꾩냽 ?占쎌쓬.

### 8. ~~dist ?占쎈뜑 ?占쎄린??~ ?????占쎄껐??(2026-03-20 dist/ ?占쎌쟾 ?占쎄굅)
- dist/ ?占쎈뜑 ?占쎌껜占?git?占쎌꽌 ?占쎄굅?占쎄퀬 .gitignore??異뷂옙??占쎌뿬 洹쇰낯 ?占쎄껐.

### 7. Firestore ?占쎄린 ?占쏀뙣媛 ?占쎈뜑留곸쓣 二쎌씠占?????
- **援먰썕**: Firestore ?占쎄린 ?占쏀뙣媛 UI ?占쎌껜占?以묐떒?占쏀궎吏 ?占쎈룄占?媛쒕퀎 try-catch ?占쎈뒗 `.catch(() => {})` ?占쎌슜.

### 6. Firestore 蹂댁븞 洹쒖튃 ?占쎌씠?占쎈━?占쏀듃 ?占쎈씫 ??湲곕뒫 ?占쎌껜 癒뱁넻
- **援먰썕**: ???占쎌슜???占쎈뱶 異뷂옙? ??`firestore.rules`??`isAllowedUserField()` ?占쎌씠?占쎈━?占쏀듃??諛섎뱶??異뷂옙?.

---

## 2026-03-15 (珥덇린 媛쒕컻 ?占쎌뀡)

### 5. ~~dist ?占쎈뜑 ?占쎄린??~ ?????占쎄껐??(2026-03-20)

### 4. ~~.firebaserc ?占쎌쓬~~ ?????占쎄껐??(2026-03-20 .firebaserc 異뷂옙?)

### 3. 諛고룷 ??git status占?誘몄빱占??占쎌씪 ?占쎌씤
- **援먰썕**: `git status`占?誘몄빱占??占쎌씪 ?占쎈뒗吏 ?占쎌씤 ??諛고룷.

### 2. ?占쎌감 await???占쎈뒫 ?占쎈윭
- **援먰썕**: ?占쎈┰?占쎌씤 Firestore 荑쇰━??`Promise.all`占?蹂묐젹 ?占쏀뻾.

### 1. Promise 泥댁씤??.catch() ?占쎈씫 ???占쎌껜 湲곕뒫 癒뱁넻
- **援먰썕**: `.then()` 泥댁씤 ?占쎌뿉 諛섎뱶??`.catch()` ?占쎈뒗 ?占쎈┰ ?占쏀뻾?占쎈줈 遺꾨━.

---

## 2026-03-27 (?占쎈떒 ?占쎌쭊 ?占??踰꾧렇 ?占쎈━占?

### 45. 占?img.src???占쎌씠吏 URL??諛섑솚?占쎈떎 ??Firebase URL 諛섎뱶??寃占?
- **利앹긽**: ?占쎈떒 ?占쎌쭊 ?占쎈뒗 ?占쎈’(lunch/dinner/snack)??`https://habitschool.web.app/`???占?占쎈맖.
- **洹쇰낯 ?占쎌씤**: `<img src="">` ?占쎄렇??`.src` ?占쎌꽦?占?鍮꾩뼱?占쎌쓣 ??釉뚮씪?占쏙옙?媛 ?占쎌옱 ?占쎌씠吏 URL??諛섑솚. `url.startsWith('https://')` 泥댄겕留뚯쑝濡쒕뒗 ?占쎌젣 Firebase URL占?援щ텇 遺덌옙?.
- **援먰썕**: Firebase Storage URL 寃利앾옙? 諛섎뱶??`url.includes('firebasestorage.googleapis.com')`?占쎈줈 ??占? `startsWith('https://')` 留뚯쑝濡쒕뒗 遺占?

### 46. clearInputs()媛 data-saved-url??珥덇린?占쏀븯吏 ?占쎌쑝占??占쎌쭨 占??占쎌씠???占쎌뿼
- **利앹긽**: ?占쎈궇 ?占쎌씠?占쏙옙? 蹂닿퀬 ?占쎈뒛占??占쎌븘?占??占?占쏀븯占??占쎈궇 ?占쎌쭊 URL???占쎈뒛 占??占쎈’???占?占쎈맖.
- **洹쇰낯 ?占쎌씤**: ?占쎌쭨 蹂占???`clearInputs()`媛 `preview.src`?占?`display`??珥덇린?占쏀븯吏占?`data-saved-url` 而ㅼ뒪?占??占쎌꽦?占??占쏙옙?. ???占쎌쭨???占쎈떦 ?占쎈’???占쎌쭊???占쎌쑝占?`data-saved-url`???占쎌쟾 ?占쎌쭨 URL???占쎌븘?占쎌쓬.
- **援먰썕**: DOM??而ㅼ뒪?占??占쎌씠?占쏙옙? 罹먯떆???占쎈뒗 諛섎뱶??珥덇린???占쎌닔?占쎌꽌???占쎄퍡 ?占쎄굅??占? `clearInputs()`??`removeAttribute('data-saved-url')` 異뷂옙?.

### 47. ?占????loadDataForSelectedDate ?占쏀샇異쒙옙? ?占쎈㈃??留앹튇??
- **利앹긽**: ?占??3占????占쎌쭊???占쎈씪議뚮떎 ?占쎌떆 ?占쏙옙??占쎈뒗 ?占쎌긽. ?占쏙옙? ?占쎈’ ?占쎌쭊 ?占쎌떎.
- **洹쇰낯 ?占쎌씤**: ?占??吏곹썑 諛깃렇?占쎌슫??`loadDataForSelectedDate` ?占쎌텧 ??`getDoc`??stale ?占쎌씠??諛섑솚 ??`clearInputs()`占??占쎈㈃ 珥덇린?????占쎌쭊 蹂듭썝 ?占쏀뙣.
- **援먰썕**: ?占???占쎄났 ??UI???占쏙옙? ?占쎈컮占??占쏀깭. `loadDataForSelectedDate`占??占쏀샇異쒗븷 ?占쎌슂 ?占쎌쓬. ?占쎌슂??UI ?占쎈뜲?占쏀듃(?占쎌뒪??泥댄겕 ??占??占?占쎈맂 ?占쎌씠?占쎈줈 吏곸젒 媛깆떊??占?

### 48. Firestore rules ?占쎌씠?占쎈━?占쏀듃?????占쎈뱶 異뷂옙?占?鍮좊쑉由э옙? 占?占?
- **利앹긽**: `checkMilestones`?占쎌꽌 `currentStreak` ?占쎈뱶 ?占????Missing permissions ?占쎈윭.
- **洹쇰낯 ?占쎌씤**: `isAllowedUserField()` ?占쎌씠?占쎈━?占쏀듃??`currentStreak` ?占쎈씫.
- **援먰썕**: ???占쎈뱶占?users 而щ젆?占쎌뿉 ????諛섎뱶??`firestore.rules`??`hasOnly([...])` 紐⑸줉??異뷂옙?. 諛고룷 ??泥댄겕由ъ뒪????占쏙옙.

### 49. Firestore getDoc ?占?占쎌븘??fallback?占?oldData媛 鍮꾩뼱?占쎈떎??????湲곗〈 URL?占?DOM?占쎌꽌 ?占쎌뼱??
- **利앹긽**: 紐⑤컮?占쎌뿉???占?????占쎌쭊??吏?占쎌쭚. Firestore getDoc 2占??占?占쎌븘?占쎌쑝占?oldData媛 占?梨꾨줈 吏꾪뻾.
- **洹쇰낯 ?占쎌씤**: `getUrlWithThumb`媛 `oldUrl`(from oldData)占?蹂닿퀬 湲곗〈 URL???占쎈떒. ?占?占쎌븘????oldData 占?占???url: null ???占쎌쭊 ??占쏙옙.
- **援먰썕**: Firestore ?占?占쎌븘??fallback ?占쏀꽩 ?占쎌슜 ?? 湲곗〈 URL?占?諛섎뱶??DOM(`data-saved-url`)?占쎌꽌???占쎌뼱???? ?占쎌꽑?占쎌쐞: oldData ??data-saved-url ??previewImg.src (Firebase URL占?.

---

## 2026-03-27 (媛ㅻ윭占??占쎌씠吏?占쎌씠??& 臾댄븳 ?占쏀겕占?踰꾧렇 ?占쎈━占?

### 50. 媛ㅻ윭占?Firestore 而ㅼ꽌 ?占쎌씠吏?占쎌씠????MAX_CACHE_SIZE?占?珥덇린 fetch占?遺꾨━?占쎌빞 ?占쎈떎
- **利앹긽**: MAX_CACHE_SIZE=30, 而ㅽ듃?占쏀봽 7?????占쎌슜??留롮쑝占?2~3?占쎌튂占?蹂댁엫.
- **洹쇰낯 ?占쎌씤**: 珥덇린 fetch limit占?占?罹먯떆 ?占쎈룄占?媛숋옙? ?占쎌닔占?臾띠뼱 ?? limit???占쎈━占?珥덇린 濡쒕뵫???占쎈젮吏???占쎈젅?占쎈뱶?占쏀봽 諛쒖깮.
- **?占쎄껐**: `FIRESTORE_PAGE_SIZE=30` (鍮좊Ⅸ 珥덇린 fetch) + `MAX_CACHE_SIZE=300` (占??占쎈룄) 遺꾨━. `startAfter` 而ㅼ꽌占??占쏀겕占??占쎈쭏???占쎌쓬 30占?fetch.
- **援먰썕**: "珥덇린 濡쒕뵫 ?占쎈룄"?占?"理쒙옙? ?占쎌떆 踰붿쐞"???占쎈줈 ?占쎈Ⅸ ?占쎄뎄. ???占쎌닔占????占쎄뎄占??占쎌떆??異⑹”?????占쎌쓬. 諛섎뱶??遺꾨━.

### 51. IntersectionObserver.disconnect() ??null 泥섎━占????占쎈㈃ ?占쎌뿰寃곗씠 ?占쎄뎄 李⑤떒?占쎈떎
- **利앹긽**: 媛ㅻ윭占??占쏙옙? ?占쏀꽣 ?占쎌젣 ???占쏀겕濡ㅽ빐??異뷂옙? 湲곕줉??濡쒕뱶 ????
- **洹쇰낯 ?占쎌씤**: `galleryIntersectionObserver.disconnect()`???占쎌텧?占쏙옙?占?蹂?占쏙옙? `null`占???留뚮벀. `renderFeedOnly()`??`if (!galleryIntersectionObserver) setupInfiniteScroll()` 議곌굔????占쏙옙 false ??observer ?占쎌뿰占?遺덌옙?.
- **?占쎄껐**: `_disconnectGalleryObserver()` ?占쏀띁占?留뚮뱾??disconnect + null 泥섎━占???占쏙옙 ?占쎄퍡 ?占쏀뻾. `_reconnectGalleryObserver()`????占쏙옙 ???占쎌뒪?占쎌뒪占?援먯껜.
- **援먰썕**: Observer/Timer/Listener占??占쎌젣????蹂?占쏙옙? 諛섎뱶??null占?珥덇린?占쏀븷 占? "?占쎌젣?占쏙옙?占?null???占쎈땶" ?占쏀깭???占쎌뿰占?肄붾뱶占?紐⑤몢 臾대젰?占쎌떆?占쎈떎.

### 52. ?占쏙옙? ?占쏀꽣 + Firestore ?占쎌씠吏?占쎌씠?? ???占쎌씠吏???占쏀꽣 寃곌낵媛 ?占쎌뼱??怨꾩냽 fetch?占쎌빞 ?占쎈떎
- **利앹긽**: ?占쎌젙 ?占쏙옙? ?占쏀꽣 ?占쎌슜 ??2~3占?湲곕줉占?蹂댁씠占????占쎌긽 濡쒕뱶 ????
- **洹쇰낯 ?占쎌씤**: `loadMoreGalleryItems()`?占쎌꽌 Firestore ?占쎌씠吏 fetch ???占쏀꽣??寃곌낵媛 ?占쎌쟾???占쎌쑝占?"?占쎌씠???占쎌쓬"?占쎈줈 ?占쎈떒??sentinel ?占쎄린占?observer 醫낅즺.
  - Firestore???占쎌껜 ?占쎌슜??湲곕줉???占쎌쭨 ?占쎌쑝占?諛섑솚 ???占쎌젙 ?占쏙옙? 湲곕줉???占쎈Ц 寃쎌슦 ???占쎌씠吏(30占???0媛쒙옙? ?????占쎌쓬.
- **?占쎄껐**: fetch ?占쎌뿉??`galleryDisplayCount >= sortedFilteredCache.length`?占쎄퀬 `galleryHasMore`?占쎈㈃ ?占쎌쓬 ?占쎌씠吏 怨꾩냽 fetch (?占쏙옙?).
- **援먰썕**: ?占쎈씪?占쎌뼵???占쏀꽣 + ?占쎈쾭 ?占쎌씠吏?占쎌씠???占쏀빀 ?? ???占쎈쾭 ?占쎌씠吏媛 ?占쏀꽣 寃곌낵 0嫄댁쓣 諛섑솚?????占쎌쓬. "0占?= ???占쎈줈 泥섎━?占쎈㈃ ???占쎄퀬 `hasMore` ?占쎈옒洹몌옙? ??占쏙옙 湲곤옙??占쎈줈 ?占쎌븘????

### 53. 而ㅼ꽌 ?占쏀깭(galleryLastDoc, galleryHasMore)??罹먯떆 珥덇린?????占쎄퍡 由ъ뀑?占쎌빞 ?占쎈떎
- **洹쇰낯 ?占쎌씤**: `cachedGalleryLogs = []` ?占쎈뒗 占?濡쒓렇?占쎌썐, ?占???? 移쒓뎄 蹂占????占쎌꽌 而ㅼ꽌 蹂?占쏙옙? 由ъ뀑 ???占쎈㈃ ?占쎌쓬 fetch媛 ?占쎈せ???占쎌튂?占쎌꽌 ?占쎌옉.
- **援먰썕**: 而ㅼ꽌 湲곕컲 ?占쎌씠吏?占쎌씠???占쏀깭??諛섎뱶??罹먯떆 珥덇린?占쏙옙? 臾띠뼱??由ъ뀑??占? `cachedGalleryLogs = []; galleryLastDoc = null; galleryHasMore = false;`占???占쏙옙 ?占쏀듃占?

---

## 2026-03-27 (admin.html 由щ돱??+ ?占쎈찓??諛쒖넚 ?占쎌뀡)

### 54. Cloud Function ?占???占쎈찓??諛쒖넚 ??for 猷⑦봽??Deadline Exceeded占??占쎈컻?占쎈떎
- **利앹긽**: ?占쎌썝 30占??占쎌긽?占쎄쾶 ?占쎈찓??諛쒖넚 ??`DEADLINE_EXCEEDED` ?占쎈윭 諛쒖깮. ?占쎌젣濡쒕뒗 ?占쎈찓?占쎌씠 紐⑤몢 諛쒖넚?占쏙옙?占??占쎈씪?占쎌뼵?占쎌뿉???占쎈윭占?諛섑솚??
- **洹쇰낯 ?占쎌씤**: `for...of` 猷⑦봽占?1嫄댁뵫 ?占쎌감 諛쒖넚 ??1嫄대떦 ??2占?횞 30占?= 60占?. 湲곕낯 ?占?占쎌븘??120珥덌옙? ?占쎄쾶 珥덇낵.
- **?占쎄껐**: `Promise.allSettled(targets.map(async (t) => { ... }))` ?占쎈줈 ?占쎌껜 蹂묐젹 諛쒖넚. ?占쎌슂 ?占쎄컙 2~3珥덈줈 ?占쎌텞. `timeoutSeconds: 300` ?占쎈줈 ?占쎌쟾占?異뷂옙?.
- **援먰썕**: CF?占쎌꽌 ?占쎌닔 ?占?占쎌뿉占??占쏙옙? API(?占쎈찓?? ?占쎌떆 ?? ?占쎌텧 ??諛섎뱶??蹂묐젹(`Promise.allSettled`)占?泥섎━??占? ?占쏀뙣??嫄댐옙? 媛쒕퀎 異붿쟻?占쎄퀬 ?占쎌껜占?留됵옙? ?占쎈룄占?

### 55. ?占쎈찓??諛쒖넚 ?占쎈젰?占?諛쒖넚占??占쎌떆??Firestore??湲곕줉?占쎌빞 ?占쎈떎
- **利앹긽**: ?占쎈찓??諛쒖넚 ??admin.html?占쎌꽌 "硫곗튌 ??諛쒖넚?占쎈뒗吏" ?????占쎌쓬. 湲곕뒫 異뷂옙? ??諛쒖넚遺꾬옙? ?占쎄툒 遺덌옙?.
- **援먰썕**: 諛쒖넚 ?占쎈젰 異붿쟻???占쎌슂??湲곕뒫?占?泥섏쓬遺??Firestore 湲곕줉 ?占쏀븿?占쎌꽌 援ы쁽??占? ?占쎌쨷??異뷂옙??占쎈㈃ 怨쇨굅 ?占쎌씠???占쎌쓬.
  - ?占쏀꽩: 諛쒖넚 ?占쎄났 ??`db.collection('emailLogs').doc(uid).set({ lastSentAt, sentCount: increment(1) }, { merge: true })`

### 56. Firebase Secrets??梨꾪똿/肄붾뱶???占쏙옙? ?占쎌텧?占쎈㈃ ???占쎈떎
- **利앹긽**: ?占쎌슜?占쏙옙? Gmail ??鍮꾬옙?踰덊샇占?梨꾪똿李쎌뿉 ?占쎈젰?占쎈젮 ?占쎌쓬.
- **援먰썕**: API ?? 鍮꾬옙?踰덊샇, Secrets??諛섎뱶???占쏙옙??占쎌뿉??`firebase functions:secrets:set SECRET_NAME` ?占쎈줈 ?占쎈젰. 梨꾪똿, 肄붾뱶, git???占쏙옙? ?占쎌텧 湲덌옙?.

---

## 諛고룷 ???占쎌닔 泥댄겕由ъ뒪??

- [ ] `sw.js` CACHE_NAME 踰꾩쟾 踰덊샇媛 ?占쎈씪媛붾뒗媛?
- [ ] sw.js ?占쎈왂??Network First?占쏙옙?? (Cache First 湲덌옙?)
- [ ] index.html????CDN `<script>` ?占쎄렇占?異뷂옙??占쏙옙? ?占쎌븯?占쏙옙??
- [ ] ??CDN ?占쏀겕由쏀듃??`integrity` + `crossOrigin` ?占쎌꽦???占쎈뒗媛?
- [ ] auth.js??`window.location.reload()` ?占쏀꽩???占쏙옙??占쎄퀬 ?占쎈뒗媛?
- [ ] onAuthStateChanged?占쎌꽌 `loadDataForSelectedDate` ?占쎌텧???占쎈뒗媛?
- [ ] Cloud Function ?占쎌텧???占?占쎌븘??+ ?占쎈갚???占쎈뒗媛?
- [ ] main push ??`cd D:\antigravity\habitschool && git pull origin main` ?占쏀뻾?占쎈뒗媛?
- [ ] ??Storage 寃쎈줈 異뷂옙? ??`storage.rules`??洹쒖튃??異뷂옙??占쎈뒗媛?
- [ ] ??Firestore ?占쎈뱶 異뷂옙? ??`firestore.rules`???占쎌씠?占쎈━?占쏀듃??異뷂옙??占쎈뒗媛?
- [ ] Firebase SDK import 踰꾩쟾???占쎈줈?占쏀듃 ?占쎌껜?占??占쎌씪?占쏙옙?? (?占쎌옱 10.8.0)
- [ ] Gemini 紐⑤뜽??`gemini-2.5-flash`?占쏙옙?? (gemini-2.0-flash ?占쎌슜 湲덌옙?)
- [ ] **git commit + push ???占쎌슜???占쎌씤??諛쏆븯?占쏙옙??** (?占쎌씤 ??firebase deploy 湲덌옙?)
## 2026-04-03 (濡쒖뺄 ?占쏙옙??占쎌씠???占쎌떆??遺占??占쎌븷 ?占쎈퀎)

### 59. 濡쒖뺄 ?占쏀봽??helper script??"臾댁뼵媛 ?占쏀듃媛 ???占쎌쓬"占?"?占쎈퉬?占쏙옙? ?占쎌긽 援щ룞 占???媛숋옙? ?占쎌쑝占?痍④툒?占쎈㈃ ???占쎈떎
- **利앹긽**: Firestore ?占쏙옙? ?占쏀듃占??占쎌븘 ?占쎄퀬 Hosting/UI媛 二쏙옙? ?占쏀깭?占쎈뜲 `start-firebase-emulators.ps1`媛 "already running"?占쎈줈 ?占쎈궡??釉뚮씪?占쏙옙??占쎌꽌??`ERR_CONNECTION_REFUSED`媛 ?占쎈떎.
- **洹쇰낯 ?占쎌씤**: helper script媛 ?占쏙옙??占쎌씠??愿???占쏀듃 占??占쎈굹?占쎈룄 LISTEN?占쎈㈃ ?占쎌긽 ?占쏀뻾?占쎈줈 媛꾩＜?占쎄퀬, ?占쎌떖 ?占쏀듃 ?占쏀듃媛 ?占쎌쟾?占쏙옙? ?占쎌씤?占쏙옙? ?占쎌븯??
- **援먰썕**: 濡쒖뺄 ?占쏀봽???占쎌옉 ?占쏀겕由쏀듃??諛섎뱶???占쎌떖 ?占쏀듃 吏묓빀???占쎌쟾?占쎄퉴吏 寃?占쏀빐???占쎈떎. 遺占??占쎌븷 ?占쏀깭??蹂꾨룄 ?占쎈윭占?痍④툒?占쎄퀬, ?占쎈룞 蹂듦뎄??紐낆떆???占쎌떆???占쎈궡???占쎌쓬 ?占쎈룞???占쏀솗???占쎌떆?占쎌빞 ?占쎈떎.
## 2026-04-03 (愿由ъ옄 沅뚰븳 ?占쎌젙 ?占쎌튂)

### 60. 愿由ъ옄 ?占쎈㈃???占쎈윴??沅뚰븳 ?占쎌젙占?Firestore / Cloud Functions???占쎈쾭 沅뚰븳 ?占쎌젙?占?諛섎뱶??媛숋옙? 湲곤옙??占쎌뼱???占쎈떎
- **利앹긽**: 愿由ъ옄 ?占쎈찓?占쏙옙? ?占쎈윴?占쎌뿉???占쎄낵?占쏙옙?占?`users` 而щ젆??list 荑쇰━?占?愿由ъ옄 callable??紐⑤몢 `permission-denied`占?留됵옙? ?占?占쎈낫?占쏙옙? 鍮꾩뼱 ?占쎌뿀??
- **洹쇰낯 ?占쎌씤**: `admin.html`?占??占쎈찓???占쎌씠?占쎈━?占쏀듃留뚯쑝占?愿由ъ옄 吏꾩엯???占쎌슜?占쎄퀬, Firestore 洹쒖튃占??占쎈쾭 ?占쎌닔??`admins/{uid}` 臾몄꽌 議댁옱占?愿由ъ옄 湲곤옙??占쎈줈 遊ㅻ떎.
- **援먰썕**: 愿由ъ옄 媛숋옙? 怨좉텒???占쎈㈃?占?"UI ?占쏀쉶 ?占쎌슜 + ?占쎈쾭???占쎈Ⅸ 湲곤옙?" 援ъ“占?留뚮뱾占?諛붾줈 源⑥쭊?? ?占쎈윴?占쏙옙? 癒쇽옙? ?占쎈쾭 湲곤옙? 沅뚰븳??蹂댁옣?占쎄굅?? 理쒖냼??媛숋옙? ?占쎌씪 吏꾩떎 ?占쎌쿇?占쎈줈 ?占쎌젙???占쎌씪?占쎌빞 ?占쎈떎.
## 2026-04-03 (Firebase Admin SDK timestamp ?占쎌슜)

### 61. Firebase Admin SDK?占쎌꽌 ?占쎈씪?占쎌뼵???占쎌쟾 ?占쎌엫?占쏀럹?占쎌뒪 諛⑹떇??`admin.firestore.FieldValue`占??占쎌뿰?占쎄쾶 ?占쎈㈃ ?占쏙옙??占쎌뿉??諛붾줈 ?占쎌쭏 ???占쎈떎
- **利앹긽**: `ensureAdminAccess` callable??`500 INTERNAL`占??占쏀뙣?占쎄퀬, 釉뚮씪?占쏙옙??占쎌꽌??愿由ъ옄 沅뚰븳 ?占쎌쓬泥섎읆 蹂댐옙???
- **洹쇰낯 ?占쎌씤**: `admin.firestore.FieldValue.serverTimestamp()`占??占쎌슜?占쎈뒗?? ?占쎌옱 ?占쏀뻾 ?占쎄꼍?占쎌꽌??占?寃쎈줈媛 `undefined`?占??
- **援먰썕**: Admin SDK 媛믪쓣 ?占쎈줈 ???占쎈뒗 濡쒖뺄 ?占쎌닔 ?占쏙옙??占쎌뿉???占쎌젣占???占??占쎌텧??蹂대ŉ 寃利앺빐???占쎈떎. ?占쎌닚 import ?占쎄났?占쎈굹 ?占쎌쟻 ?占쎄린留뚯쑝濡쒕뒗 異⑸텇?占쏙옙? ?占쎈떎. 硫뷂옙? 湲곕줉???占쎄컖?占??占쎌슂 ?占쎌긽?占쎈줈 `FieldValue`???占쎌〈?占쏙옙? 留먭퀬 `Date` ?占쎈뒗 寃利앸맂 ?占쎈쾭 SDK 寃쎈줈占??占쎌슜?占쎈떎.
### 62. ?占쎌슜?占쏙옙? ?占쏙옙? 紐낆떆?占쎌쑝占?諛고룷 沅뚰븳??以щ떎占?媛숋옙? 踰붿쐞??staging 諛고룷???占쎌떆 ?占쎌씤 ?占쎌감占?諛섎났?占쏙옙? ?占쎈뒗??
- **利앹긽**: `main` ?占쎌떆 ??staging 諛고룷 吏곸쟾, ?占쎌슜?占쏙옙? ?占쏙옙? ?占퐏taging?占??占쎌씤 ?占쎌씠 吏꾪뻾?占쎈룄 ?占쎈떎?占쎄퀬 留먰뻽?占쎈뜲??異뷂옙? ?占쎌씤???占쎌떆 ?占쎌껌?????占쎈떎.
- **洹쇰낯 ?占쎌씤**: ?占?占쎌냼 洹쒖튃???占쎈같?????占쎌씤?占쎌쓣 湲곌퀎?占쎌쑝占??占쎌슜?占쎈㈃?? 媛숋옙? ?占???占쎌뿉???占쎌슜?占쏙옙? 以 紐낆떆???占쎌쇅 ?占쎌슜???占쎌옱 ?占쎌뾽 踰붿쐞??諛섏쁺?占쏙옙? 紐삵뻽??
- **援먰썕**: 湲곕낯 洹쒖튃?占?吏?占쎈릺, ?占쎌슜?占쏙옙? ?占쎌옱 踰붿쐞???占????援ъ껜?占쎌씤 ?占쎌쇅 沅뚰븳??二쇰㈃ 占?沅뚰븳???占쎌꽑?占쎈떎. ?占쏀엳 `staging` 媛숋옙? 鍮꾨낯?占쎈쾭 諛고룷???占쎌슜?占쎌쓽 理쒖떊 紐낆떆 ?占쏙옙?占?洹몌옙?占??占쏀뻾?占쎈줈 ?占쎄껐?占쎌빞 ?占쎈떎.

## 2026-04-04 (怨듭쑀 湲곕낯 ?占쎌냽 議곗젙)
### 61. 湲곕낯 怨듭쑀 ?占쎌콉?占?洹몌옙?占??占쎄퀬??占??占쎈㈃ ?占쎌텧 諛?占쎈뒗 ??以꾩씪 ???占쎌뼱???占쎈떎
- **援먰썕**: 怨듦컻 ?占쎌콉??諛붽씔 ?占쎌뿉??`臾댁뾿??湲곕낯?占쎈줈 蹂댁뿬以꾬옙?`占??占쎈줈 ??占????占쎈벉?占쎌빞 ?占쎈떎. 怨듦컻 ?占쏙옙??占??占쎈낫 諛?占쎈뒗 媛숋옙? 臾몄젣媛 ?占쎈땲誘占? 湲곕낯 怨듭쑀?占쎈룄 占?以꾩뿉??遺?占쎈릺???占쎌냼??以꾩씠占?媛由ш린 ?占쎌뀡?占???鍮좊Ⅴ占??占쏀빐?占쎄쾶 留뚮뱺??
- 2026-04-04: 紐⑤컮???占쎈궡 諛뺤뒪??踰꾪듉??媛숋옙? ?占쎄낸???占쎌뿉 ?占쏙옙?占??占쏙옙? 占?占? ?占쎈궡?占??占쎌뀡 踰꾪듉?占?遺꾨━?占쎄퀬, ?占쏀옒 ?占쎈꼸?占??占쎈━占?諛붾줈 ?占쎈옒??遺숈뿬???占쎌묠占??占쎌틪 ?占쏙옙???以꾩씤??

## 2026-04-04 (?占?占쎈낫??CTA ?占쎌텞)

### 60. 媛숋옙? 紐⑹쟻??CTA?????占쎈㈃????踰덈쭔 ?占쎈떎
- 利앹긽: `??湲곕줉` ?占쎈㈃?占쎌꽌 移쒓뎄 珥덌옙?, ?占??李몄뿬, 怨듭쑀 ?占쎌젙 媛숋옙? 踰꾪듉???占쎈윭 諛뺤뒪??諛섎났???占쎌슜?占쏙옙? 臾댁뾿??癒쇽옙? ?占쎌빞 ?占쏙옙? ?占쎈떒?占쎄린 ?占쎈젮?占쎈떎.
- 援먰썕: ?占?占쎈낫??媛쒗렪 ?占쎌뿉??`???占쎌뀡????紐⑹쟻`, `媛숋옙? 紐⑹쟻 CTA????踰덈쭔` ?占쎌튃??吏?占쎈떎. 媛ㅻ윭占??占쎌슜 ?占쎌젙?占?媛ㅻ윭由ъ뿉 ?占쎄린占? ?占?占쎈낫?占쎈뒗 ?占쎈뒛 ?占쎌빞 ???占쎈룞占??占쎌옱 吏꾪뻾 以묒씤 誘몄뀡占?癒쇽옙? 蹂댁뿬以??

## 2026-04-04 (二쇨컙 誘몄뀡 ?占쎌꽕??利됱떆 諛섏쁺)

### 60. ?占쎌꽕??由ъ뀑 ?占쎌뀡?占??占쎈쾭 ?占?占쎈쭔 ?占쏙옙? 留먭퀬 ?占쎈㈃ 罹먯떆源뚳옙? 媛숋옙? ?占쎌뿉 鍮꾩썙???占쎈떎
- **利앹긽**: `?占쎈쾲 占?誘몄뀡 ?占쎌떆 ?占쏀븯占? ?占쎌씤 ??`誘몄뀡??珥덇린?占쎈릺?占쎌뒿?占쎈떎` ?占쎌뒪?占쏙옙? ?占쎈룄 ?占?占쎈낫?占쏙옙? ?占쎌쟾 吏꾪뻾 ?占쏀깭占??占쎌떆 洹몃젮???占쎌꽕???占쎌씤李쎌씠 ?占쎌냽?占쎈줈 ?占쎈떎.
- **洹쇰낯 ?占쎌씤**: `resetWeeklyMissions()`媛 Firestore?占쎈뒗 `weeklyMissionData: null`???占?占쏀뻽吏占? `renderDashboard()`媛 吏곹썑 硫붾え占?罹먯떆?占?localStorage 罹먯떆???占쎌쟾 `weeklyMissionData`占??占쎌떆 ?占쎌슜?占쎈떎.
- **援먰썕**: ?占?占쎈낫?占쎌쿂??罹먯떆占??占쎈뒗 ?占쎈㈃?占쎌꽌 由ъ뀑/?占쎌꽕???占쎌뀡??留뚮뱾占??占쎈쾭 write ?占쎌뿉 ?占쎈궡吏 留먭퀬, 媛숋옙? ?占쎌닔?占쎌꽌 濡쒖뺄 罹먯떆?占??占쎈㈃ 湲곤옙? ?占쎌씠?占쎈룄 利됱떆 媛숋옙? ?占쏀깭占??占쎌튂????fresh fetch占?諛깃렇?占쎌슫?占쎈줈 ?占쎌썙???占쎈떎.

## 2026-04-05 (?占?占쎈낫???占쎌닚??泥닿컧)

### 61. ?占?占쎈낫???占쎌닚?占쎈뒗 ?占쎈떒 CTA占?以꾩씠吏 留먭퀬 ?占쎌쐞 紐⑤뱢 移대뱶?占?蹂댁“ ?占쎄뎄源뚳옙? 媛숈씠 ?占쎈━?占쎌빞 ?占쎌슜?占쏙옙? 蹂?占쏙옙? ?占쏙옙???
- **利앹긽**: ??湲곕줉 ??占쏙옙 ?占쎌닚?占쏀뻽?占쎄퀬 諛섏쁺?占쏙옙?占??占쎌슜?占쎈뒗 ?占쎌쟾??踰꾪듉??寃뱀튂占?湲몄씠媛 湲몄뼱??"蹂??占??占쎈떎"占??占쎄펷??
- **洹쇰낯 ?占쎌씤**: ?占쎈떒 ?占쎌빟 移댄뵾?占??占쏙옙? 踰꾪듉占?以꾬옙?占? ?占쎌젣 湲몄씠占?留뚮뱶??`移쒓뎄 泥댄겕 / 移쒓뎄 梨뚮┛吏 / 而ㅿ옙??占쏀떚 / 留덉씪?占쏀넠 / 寃곌낵吏` ?占쎌쐞 釉붾줉?占?洹몌옙?占??占쎌븘 ?占쎌뿀??
- **援먰썕**: 紐⑤컮??而댄뙥??媛쒗렪?占쎌꽌??移댄뵾蹂대떎 癒쇽옙? DOM ?占쎈꺼?占쎌꽌 以묐났 紐⑤뱢???占쎄굅?占쎌빞 ?占쎈떎. ??諛뺤뒪?占쎈뒗 ???占쎈룞占??占쎄린占? 蹂댁“ ?占쎈낫???占쎄린??蹂꾨룄 ?占쎈㈃?占쎈줈 鍮쇱빞 泥닿컧???占쎄릿??

## 2026-04-05 (??湲곕줉 ??以묐났 ?占쎈━ 2占?

### 60. ?占?占쎈낫???占쎌닚?占쎈뒗 移대뱶 ?占쎈쭔 以꾩씠吏 留먭퀬 ?占쎌젣 CTA 以묐났占??占쎈┃ 寃쎈줈源뚳옙? ?占쎄퍡 寃利앺빐???占쎈떎
- **利앹긽**: `?占쎈뒛??猷⑦떞`占?`?占쎈뒛 ?占쏙옙? ?占쎈룞`??媛숋옙? ??占쏙옙???占쎄퀬, `?占쎄퍡?占쎄린`???占쎈ぉ/蹂몃Ц/踰꾪듉??以묐났?占쎌뼱 ?占쎌슜?占쏙옙? 臾댁뾿???占쎈윭???占쎈뒗吏 ?占쎌떆 ?占쎌꽍?占쎌빞 ?占쎈떎. 移쒓뎄 珥덌옙? 踰꾪듉??議댁옱?占쏙옙?占??占쎌젣濡쒕뒗 QR ?占쎌〈 寃쎈줈???占쎌슜?占쏙옙? 泥닿컧??"???占쎈뒗 踰꾪듉"泥섎읆 蹂댐옙???
- **援먰썕**: ?占?占쎈낫???占쎌닚???占쎌뾽?占쎌꽌??1) 媛숋옙? 寃곗젙???占쎄뎄?占쎈뒗 移대뱶媛 ??占??占쎌븘 ?占쏙옙? ?占쏙옙?吏, 2) CTA媛 ?占쎌젣占?媛???占쎌젙?占쎌씤 紐⑹쟻吏占??占쎄껐?占쎈뒗吏, 3) 紐⑤컮??占????占쎈㈃ ?占쎌뿉???占쎌떖 ?占쎈룞占?二쇨컙 誘몄뀡 ?占쎌젙???占쎈굹?占쏙옙?占?staging?占쎌꽌 ?占쎌젣 ?占쎈윭???占쎌씤?占쎌빞 ?占쎈떎.

## 2026-04-05 (staging 泥닿컧 寃利앷낵 罹먯떆)

### 61. 援ъ“ 媛쒗렪?占?肄붾뱶 diff蹂대떎 staging?占쎌꽌 ?占쎌젣 蹂댁씠??諛뺤뒪 湲곤옙??占쎈줈 寃利앺빐???占쎈떎
- **利앹긽**: 濡쒖뺄 肄붾뱶?占쎌꽌??以묐났 移대뱶占?類먮뒗?占쎈룄 staging/PWA 罹먯떆 ?占쎈㈃?占쎌꽌???占쎌쟾 諛뺤뒪?占?寃뱀튂??踰꾪듉??洹몌옙?占?蹂댁뿬 ?占쎌슜?占쏙옙? "蹂??占??占쎈떎"占??占쎄펷??
- **援먰썕**: ?占?占쎈낫??援ъ“ 蹂寃쎌뿉?占쎈뒗 1) service worker 罹먯떆 踰꾩쟾???占쎄퍡 ?占쎈━占? 2) staging?占쎌꽌 ?占쎌젣 占??占쎈㈃ 湲곤옙??占쎈줈 ?占쎌븘 ?占쎈뒗 諛뺤뒪占??占쎌떆 ?占쎄퀬, 3) ?占쎄굅 ?占?占쎌씠 ?占쎈뜑 ?占쎌닔占??占쎈땲??DOM 諛곗튂?占쎈룄 ?占쎌븘 ?占쏙옙? ?占쏙옙?吏 ?占쎌씤?占쎌빞 ?占쎈떎.

### 62. 紐⑤컮??踰꾪듉?占???占쏙옙 100%占??占쎌슦吏 留먭퀬 而⑦뀒?占쎈꼫 諛⑺뼢源뚳옙? 媛숈씠 諛붽퓭???占쎈떎
- **利앹긽**: 二쇨컙 誘몄뀡 諛뺤뒪?占쎌꽌 `?占쎈떒 湲곕줉` 踰꾪듉??媛濡쒗룺????李⑨옙??占쎈㈃???占쎌そ ?占쎈챸 ?占쎌뿭???占쎈줈 湲?占쎌쿂??李뚭렇?占쎌죱??
- **援먰썕**: 紐⑤컮?占쎌뿉??CTA占??占쏀엳?占쎈㈃ 踰꾪듉 ?占쎌껜占?議곗젙?占쏙옙? 留먭퀬 遺占?flex 而⑦뀒?占쎈꼫占??占쎈줈 諛곗튂占?諛붽씀占? ?占쎈챸 ?占쎌뿭??異⑸텇????占쏙옙 ?占쎄린?占쏙옙? ?占쎌젣 ?占쎈㈃?占쎈줈 ?占쎌씤?占쎌빞 ?占쎈떎.

### 63. ?占쏀깮吏媛 3媛쒖쿂???占쎄퀬 怨좎젙???占쎈뒗 ?占쎈∼?占쎌슫蹂대떎 踰꾪듉?占쎌씠 ??鍮좊Ⅴ??
- **利앹긽**: 二쇨컙 誘몄뀡 ?占쎌씠?占쏙옙? ?占쎈∼?占쎌슫?占쎈줈 諛붽씀???占쎈㈃?占?吏㏃븘議뚳옙?占? ?占쎌슜?占쎈뒗 `?占쏙옙? / 蹂댄넻 / ?占쎌쟾`???占쎈늿??鍮꾧탳?占쎄퀬 諛붾줈 ?占쎈Ⅴ占??占쎈젮?占쎌죱??
- **援먰썕**: 紐⑤컮??而댄뙥?占쏀솕?占쎌꽌???占쏀깮吏媛 ?占쎄퀬 ?占쏙옙? 鍮꾧탳媛 以묒슂??寃쎌슦?占쎈뒗 ?占쎄린湲곕낫??踰꾪듉???占쎄렇癒쇳듃媛 ?占쎈떎. ?占쎌씠 異뺤냼?占??占쏀깮 ?占쎈룄 占?異⑸룎???占쎈㈃, 癒쇽옙? ?占쎌젣 ?占쏀깮 ?占쎈룄占?吏?占쎄퀬 洹몃떎???占쎈뵫占?占??占쏙옙? 以꾩씤??
## 2026-04-05 (移쒓뎄 珥덌옙? 肄붾뱶?占?移댁뭅???占쎄껐 肄붾뱶 ?占쎌꽑)

### 60. 移쒓뎄 珥덌옙? 肄붾뱶?占?怨꾩젙 ?占쎄껐 肄붾뱶??UI?占쎌꽌 媛숋옙? 醫낅쪟泥섎읆 蹂댁씠占????占쎈떎
- **利앹긽**: ?占쎈줈?占쎌뿉 `?占쎄껐 肄붾뱶` 移대뱶?占?`??珥덌옙? 肄붾뱶` 移대뱶媛 媛숈씠 蹂댁뿬?? ?占쎌슜?占쏙옙? 移쒓뎄 ?占쎄껐??肄붾뱶占????占쎈줈 留뚮뱶??寃껋쑝占??占쏀빐?占쎈떎.
- **洹쇰낯 ?占쎌씤**: ?占쎌젣濡쒕뒗 `referralCode`媛 移쒓뎄 ?占쎌껌?? `chatbotLinkCode`媛 移댁뭅???占쎈튆肄붿튂 怨꾩젙 ?占쎄껐??1?占쎌꽦 肄붾뱶?占쎈뜲, UI 臾멸뎄媛 ?占쏙옙? 異⑸텇??援щ텇?占쏙옙? 紐삵뻽??
- **援먰썕**: 移쒓뎄 珥덌옙?, 怨꾩젙 ?占쎄껐, ?占쎌쬆 媛숈씠 肄붾뱶??湲곕뒫???占쎈윭 占??占쎌쓣 ?占쎈뒗 紐⑹쟻???占쎈쫫??吏곸젒 ?占쎌빞 ?占쎈떎. `?占쎄껐 肄붾뱶` 媛숋옙? ?占쎄큵 ?占쏀쁽 ?占??`移댁뭅???占쎈줉 肄붾뱶`, `移쒓뎄 珥덌옙? 肄붾뱶`泥섎읆 ?占쎈룄占?諛붾줈 蹂댁뿬二쇨퀬, ?占쎈줈 ?占쎈Ⅸ 肄붾뱶 ?占쎈쫫??媛숋옙? ?占쎌쿂???占쏀엳吏 ?占쎄쾶 ?占쎄퀎??占?

### 61. ?占쎌떖 ?占쎌빟 吏?占쎈뒗 ?占쏙옙? ?占쎈㈃?占쎌꽌???占쏙옙? 援ъ“占??占쏙옙??占쎌빞 ?占쎈떎
- **利앹긽**: `?占쎌냽 湲곕줉 / ?占쎈뒛 ?占쎈즺 / ?占쎈쾲 占??占쎌쬆 / ?占쎌쓬 蹂댁긽` 移대뱶媛 紐⑤컮?占쎌뿉??1?占쎈줈 湲멸쾶 ?占쎌뿬 ?占쎈㈃??遺덊븘?占쏀븯占??占쎈졇??
- **洹쇰낯 ?占쎌씤**: `max-width: 360px` ?占쎌쇅?占쎌꽌 ?占쎌빟 移대뱶占?1?占쎈줈 諛붽씀??CSS媛 ?占쎌븘 ?占쎌뿀占? ??吏??臾띠쓬?????占쏀듃?占쎈뒗 ?占쎈낫 援ъ“占?源⑤쑉?占쎈떎.
- **援먰썕**: ?占쎌떖 KPI 4媛쒖쿂??臾띠쓬?占쎈줈 ?占쏙옙????占쎈뒗 ?占쎌빟 移대뱶??珥덉냼???占쎈㈃?占쎌꽌??媛?占쏀븳 ??`2x2` 援ъ“占??占쏙옙??占쎌빞 ?占쎈떎. ?占쎈Т 醫곸쓣 ?占쎈뒗 ???占쏙옙? 以꾩씠湲곕낫???占쎈뵫占?湲???占쎄린占?癒쇽옙? 以꾩씪 占?

### 62. ??湲곕줉 ?占쎌떖 諛뺤뒪???占쎄린蹂대떎 蹂몃Ц?占쎌꽌 諛붾줈 蹂댁뿬二쇰뒗 ?占쎌씠 ?占쎈떎
- **利앹긽**: `?占쎈쾲 占??占쎈쫫`占?`?占쎌쓽 留덉씪?占쏀넠`??`湲곕줉 ?占쎈낫占? ?占쎌쑝占??占쎌뼱媛硫댁꽌, ?占쎌슜?占쏙옙? ??湲곕줉 ??占쏙옙??諛붾줈 遊먯빞 ???占쎈낫占??占쎌떆 ??占??占쎌뼱???占쎈떎.
- **洹쇰낯 ?占쎌씤**: ?占쎈㈃ 湲몄씠占?以꾩씠?占쎈뒗 怨쇱젙?占쎌꽌 2占??占쎈낫?占??占쎌떖 ?占쎄퀬 ?占쎈낫占?媛숋옙? ?占쏀옒 ?占쎌뿭?占쎈줈 臾띠뼱 踰꾨졇??
- **援먰썕**: ??湲곕줉 ??占쏙옙?占쎈뒗 ?占쎌옱 吏꾪뻾占??占쎄퀬??吏곸젒 ?占쎄껐?占쎈뒗 諛뺤뒪??湲곕낯 ?占쎌텧占??占쎄퀬, ?占쎈쭚 蹂댁“?占쎌씤 ?占쎄뎄占??占쎌쓣 占? 湲몄씠占?以꾩씪 ?占쎈뒗 癒쇽옙? 以묐났 CTA?占?臾멸뎄占?以꾩씠占? ?占쎌떖 移대뱶 visibility??留덌옙?留됱뿉 嫄대뱶占?占?
## 2026-04-05 (怨듭쑀 移대뱶 罹≪쿂 ?占쎌젙??

### 64. html2canvas占?怨듭쑀 移대뱶占?留뚮뱾 ?占쎈뒗 罹≪쿂 ?占쎌뿉 ?占쏙옙?吏媛 ?占쎌젣占?decode???占쏀깭?占쏙옙? 癒쇽옙? 蹂댁옣?占쎌빞 ?占쎈떎
- **利앹긽**: 怨듭쑀 移대뱶?占쎌꽌 ?占쎈떒/?占쎈룞 ?占쏙옙?吏媛 ?占쎈㈃?占쎈뒗 蹂댁씠?占쎈뜲, ?占쎌젣 怨듭쑀??PNG?占쎈뒗 占?諛뺤뒪泥섎읆 鍮좎졇 蹂댐옙???
- **洹쇰낯 ?占쎌씤**: 移대뱶 DOM??洹몃┛ 吏곹썑 `html2canvas`占??占쎌텧?占쎈㈃?? ?占쏙옙? `img`媛 ?占쎌쭅 ?占쎌쟾??以鍮꾨릺吏 ?占쎌븯嫄곕굹 ?占쎄꺽 URL??洹몌옙?占??占쎌븘 罹≪쿂 ?占쎌젏???占쎈씫?占쎈떎.
- **援먰썕**: 怨듭쑀??移대뱶 罹≪쿂?占쎌꽌??1) ?占쎌옱 DOM ?占쎌쓽 `img`占?癒쇽옙? 湲곕떎由ш퀬, 2) 媛?占쏀븯占?data URL占?怨좎젙???? 3) 占??占쎌쓬??`html2canvas`占??占쎌텧?占쎌빞 ?占쎈떎. ?占쎄꺽 fetch媛 ?占쏀뙣?占쎈룄 占?諛뺤뒪媛 ?占쎈땲???占쎌꽦???占쎈젅?占쎌뒪?占?占쏙옙? 蹂댁씠?占쎈줉 留덌옙?占??占쎈갚源뚳옙? ?占쎄꺼???占쎈떎.
## 2026-04-05 (怨듭쑀 移대뱶 誘몃━蹂닿린/罹≪쿂 ?占쎌젙??

### 60. 怨듭쑀 誘몃━蹂닿린?占??占쎌젣 罹≪쿂??媛숋옙? 以鍮꾨맂 ?占쏙옙?吏 ?占쎌뒪占??占쎌빞 ?占쎈떎
- **利앹긽**: 怨듭쑀 移대뱶 諛뺤뒪?占쎌꽌???占쏙옙?吏媛 源⑨옙?占? `怨듭쑀?占쎄린`占??占쎈Ⅴ占?`?占쏙옙?吏 ?占쎌꽦 占?..`?占쎌꽌 硫덉톬??
- **洹쇰낯 ?占쎌씤**: ?占쎌씠吏 誘몃━蹂닿린???占쎄꺽 Storage URL??洹몌옙?占?洹몃━占? 罹≪쿂 ?占쎌젏?占쎈뒗 ?占쎌떆 蹂꾨룄 fetch/base64 蹂?占쎌쓣 ?占쎈㈃???占쎈┛ ?占쎈떟 ?占쎈굹媛 ?占쎌껜 ?占쎈쫫??遺숈옟占??占쎌뿀??
- **援먰썕**: 怨듭쑀 湲곕뒫?占?`誘몃━蹂닿린???占쎌쟾 ?占쎈꽕??以占?-> 占?寃곌낵占?罹≪쿂` ??占??占쎈쫫?占쎈줈 怨좎젙?占쎌빞 ?占쎈떎. ?占쎄꺽 URL??諛붾줈 洹몃━吏 留먭퀬, ?占?占쎌븘?占쎌씠 ?占쎈뒗 以占??占쎄퀎?占쎌꽌 data URL ?占쎈뒗 ?占쎈젅?占쎌뒪?占?占쎈줈 癒쇽옙? ?占쎌젙????誘몃━蹂닿린?占?理쒖쥌 ?占쏙옙?吏媛 媛숋옙? ?占쎌뒪占??占쎄쾶 留뚮뱾?占쎌빞 ?占쎈떎.

### 61. 怨듭쑀 誘몃━蹂닿린?占?罹≪쿂??媛숋옙? DOM??諛붾줈 ?占쎌궗?占쏀븯吏 留먭퀬 ??占쏙옙??遺꾨━?占쎌빞 ?占쎈떎
- **利앹긽**: 源⑥쭊 ?占쏙옙?吏占?留됱쑝?占쎄퀬 ?占쎌쟾???占쎈젅?占쎌뒪?占???占쎌＜占?諛붽씀?? ?占쎈쾲?占쎈뒗 誘몃━蹂닿린 移대뱶?占쎌꽌???占쎌젣 ?占쎌쭊???占쎈씪議뚮떎.
- **洹쇰낯 ?占쎌씤**: ?占쎈㈃??蹂댁뿬二쇰뒗 移대뱶?占?怨듭쑀 ?占쎄컙?占쎈쭔 ?占쎌슂??罹≪쿂 ?占쎌젙??濡쒖쭅????寃쎈줈占?臾띠뼱?? 罹≪쿂???占쎈갚??誘몃━蹂닿린 UX源뚳옙? ??占쏙옙?占쎈떎.
- **援먰썕**: ?占쎌슜?占쏙옙? 蹂대뒗 誘몃━蹂닿린???占쎌젣 ?占쏙옙?吏 ?占쎌꽑, 怨듭쑀 ?占쎄컙?占쎈뒗 罹≪쿂 ?占쎌젙???占쎌꽑?占쎈줈 ?占쎄퀎?占쎌빞 ?占쎈떎. 占?`蹂댁씠??移대뱶`?占?`罹≪쿂??以占??占쎄퀎`??遺꾨━?占쎄퀬, 怨듭쑀 ?占쎌뿉???占쎈㈃ 移대뱶占??占쎈옒 ?占쏀깭占?蹂듭썝?占쎈뒗 ?占쎈쫫??湲곕낯媛믪쑝占??占쎈뒗??

### 62. 紐⑤컮??諛섏쓳 踰꾪듉?占??占쎌뒪??湲몄씠占?湲곤옙??占쎈줈 媛뺤젣占???占?怨좎젙?占쎌빞 ?占쎈떎
- **利앹긽**: 媛ㅻ윭占?移대뱶??`醫뗭븘?? 踰꾪듉??紐⑤컮?占쎌뿉????以꾨줈 爰얠뿬 蹂댁뿬??踰꾪듉 ?占쎌씠?占?由щ벉??源⑥죱??
- **洹쇰낯 ?占쎌씤**: ?占쎌씠占? ?占쎈꺼, ?占쎌옄 諛곤옙?占?媛숋옙? inline ?占쎈쫫?占쎈쭔 ?占쎄퀬 以꾨컮占??占쎌빟??紐낆떆?占쏙옙? ?占쎌븘 ??占쏙옙 議곌툑占?遺議깊빐???占쎈꺼???占쎈옒 以꾨줈 諛?占쎈떎.
- **援먰썕**: 4占?諛섏쓳 踰꾪듉泥섎읆 ??占쏙옙 醫곻옙? UI??`?占쎌씠占?/ ?占쎈꺼 / 諛곤옙?`占?紐낆떆?占쎌씤 ?占쎈’?占쎈줈 ?占쎈늻占? `white-space: nowrap`, ?占쏙옙? ?占쏀듃, 怨좎젙 shrink 洹쒖튃??媛숈씠 以섏꽌 ??占?諛곗튂占?媛뺤젣?占쎌빞 ?占쎈떎.

## 2026-04-05 (怨듭쑀 移대뱶 誘몃━蹂닿린/?占쎌젣 ?占쎌씪 遺덉씪占??占쎌젙)

### 怨듭쑀 誘몃━蹂닿린?占??占쎌젣 怨듭쑀 ?占쎌씪?占?媛숋옙? ?占쎈뜑?占쏙옙? ?占쎌빞 ?占쎈떎
- 利앹긽: ?占쎈㈃?占쎌꽌??移대뱶媛 蹂댁씠?占쎈뜲 怨듭쑀 ?占쎌씪?占?源⑨옙?嫄곕굹, 諛섓옙?占?怨듭쑀 諛뺤뒪??placeholder?占쎈뜲 ?占쎌젣 ?占쎌씪 ?占쎌꽦?占?硫덉톬??
- 洹쇰낯 ?占쎌씤: DOM 誘몃━蹂닿린?占?html2canvas 罹≪쿂媛 ?占쎈줈 ?占쎈Ⅸ 寃쎈줈占??占쎈㈃???占쏙옙? ?占쏙옙?吏 濡쒕뵫/CORS ?占쏀뙣 ?占쎌긽???占쎈옄??
- 援먰썕: 怨듭쑀 湲곕뒫?占?誘몃━蹂닿린?占??占쎌젣 ?占쎌씪 ?占쎌꽦??媛숋옙? 罹붾쾭???占쎈뜑?占쎈줈 ?占쎌씪?占쎄퀬, preview ?占쎌슜 <img>?占쎈뒗 遺덊븘?占쏀븳 crossorigin 媛뺤젣占??占쏙옙? ?占쎈뒗??
### 65. Firebase Storage 占싱뱄옙占쏙옙占쏙옙 占쏙옙占쏙옙 카占쏙옙 캔占쏙옙占쏙옙占쏙옙 占쏙옙 占쏙옙占쏙옙 占쏙옙占쏙옙占쏙옙占쏙옙 占쏙옙占쏙옙 fetch占쏙옙占쏙옙 占십는댐옙
- 占쏙옙占쏙옙: staging 占쏙옙占쏙옙占쏙옙占쏙옙 占쏙옙占쏙옙 카占썲가 `firebasestorage.googleapis.com` CORS 占쏙옙占쏙옙占쏙옙 占쏙옙占쏙옙 占싱몌옙占쏙옙占썩가 占쏙옙킬占?占쏙옙占쏙옙占쏙옙.
- 占쌕븝옙 占쏙옙占쏙옙: 占쏙옙占쏙옙占쏙옙占쏙옙占쏙옙 Storage 占쌕울옙琯占?URL占쏙옙 base64/canvas 占쎈도占쏙옙 占쌕쏙옙 占쏙옙占쏙옙占쏙옙 占쌩곤옙, `<img>` 표占시울옙 占쌨몌옙 fetch/canvas 占쏙옙灌占?CORS 占쏙옙占쏙옙占쏙옙 占쌓댐옙占?占쌨았댐옙.
- 占쏙옙占쏙옙: 占쏙옙占쏙옙 카占쏙옙처占쏙옙 캔占쏙옙占쏙옙占쏙옙 占쌌쇽옙占싹댐옙 占쏙옙占쏙옙占?Storage 占싱듸옙低?callable 占실댐옙 占쏙옙占쏙옙 占쏙옙占쏙옙占쏙옙 占쏙옙占쏙옙 占쌔븝옙占싹곤옙, 占쏙옙占쏙옙占쏙옙占쏙옙 占쏙옙 占쏙옙占쏙옙占?占쏙옙占쏙옙占쌔억옙 占싼댐옙. 占쏙옙占쏙옙 fetch fallback占쏙옙 占쌕쏙옙 占쏙옙占쏙옙 占십는댐옙.

### 66. 占쏙옙占쏙옙 占싱몌옙占쏙옙占쏙옙占쏙옙 占싸듸옙 占쏙옙占승울옙 占싹쇽옙 占쏙옙占승댐옙 hidden占쏙옙 占쏙옙占쏙옙 占쏙옙占쏙옙 display占쏙옙占쏙옙 占쏙옙占쏙옙 占쏙옙占쏙옙占싼댐옙
- 占쏙옙占쏙옙: 占쏙옙占쏙옙 카占쏙옙 占싱몌옙占쏙옙占쏙옙 占싱뱄옙占쏙옙占쏙옙 占쏙옙占쏙옙占쏙옙 占쏙옙 占쏙옙 占쏙옙占쏙옙 占쏙옙占쏙옙占쏙옙 占싱뱄옙占쏙옙 占쏙옙占쏙옙占쏙옙 占쏙옙占쏙옙 占쏙옙占쏙옙占쏙옙.
- 占쌕븝옙 占쏙옙占쏙옙: 占쏟동깍옙 占쏙옙占쏙옙 占쏙옙占쏙옙占쏙옙占쏙옙 preview/empty 占쏙옙柰占?占쏙옙占쏙옙占쏙옙 占쏙옙占신되몌옙 占쏙옙占승곤옙 占쏙옙參占쏙옙占? 占쏙옙占쏙옙 占쏙옙 占쏙옙占쏙옙 占쏙옙琯占?占쏙옙占쌩댐옙.
- 占쏙옙占쏙옙: 占싱몌옙占쏙옙占쏙옙 UI占쏙옙 `preview 표占쏙옙`, `placeholder 표占쏙옙`占쏙옙 占싹놂옙占쏙옙 占쌉쇽옙占쏙옙占쏙옙 `hidden + display`占쏙옙 占쏙옙占쏙옙 占쏙옙占쏙옙占싹곤옙, preview onerror占쏙옙占쏙옙占쏙옙 占쏙옙占?占쏙옙 占쏙옙占승뤄옙 占쏙옙占싶쏙옙킨占쏙옙.

### 67. 카카占쏙옙/占싱몌옙占쏙옙 占쏙옙占쏙옙占쏙옙크처占쏙옙 占싸깍옙占쏙옙 占쏙옙占쏙옙 占싱억옙占쏙옙占쏙옙 占싹댐옙 占쏙옙큰占쏙옙 URL占쏙옙 占쏙옙占쏙옙 占쏙옙占쏙옙 localStorage占쏙옙占쏙옙 占쏙옙占쏙옙占싼댐옙
- 占쏙옙占쏙옙: 占싸깍옙占쏙옙 占쏙옙占쏙옙 占쏙옙占싸드가 占쏙옙占쏙옙 search 占식띰옙占쏙옙拷占?占쏙옙占쏙옙占쏙옙 占쏙옙占쏙옙 占썲름占쏙옙 占쏙옙占쏙옙 占쏙옙占쏙옙占?
- 占쏙옙占쏙옙: `pendingReferralCode`처占쏙옙 `pendingChatbotConnectToken`占쏙옙 占쏙옙占시울옙 占쏙옙占쏙옙占싹곤옙, auth listener占쏙옙占쏙옙 占쎌선 占쏙옙占쏙옙占쏙옙 占쏙옙占쏙옙占쏙옙 占쏙옙占쏙옙 占쏙옙 占쏙옙 占쏙옙占쏙옙 占쌀븝옙占쌔억옙 占싼댐옙.

### 68. 占쏙옙占쏙옙 fallback 占쌘듸옙占?占썩본 占썲름占쏙옙占쏙옙 占싣뤄옙占쏙옙 占쏙옙占쏙옙占쏙옙 占쏙옙占쏙옙微占?占쏙옙占쏙옙 1占쏙옙占쏙옙 占썅동占쏙옙 占쏠갈몌옙占쏙옙 占십는댐옙
- 占쏙옙占쏙옙: `!占쏙옙占쏙옙`占쏙옙 占썩본占싸듸옙占쏙옙 占쏙옙占?占쌘듸옙 占쏙옙占쏙옙 占쏙옙튼占쏙옙 占쏙옙占쏙옙 占쏙옙占싱몌옙 占쏙옙占쏙옙微占?占쏙옙 占쌕몌옙 占쌘드를 占쏙옙占쏙옙占쏙옙 占싼다곤옙 占쏙옙占쏙옙占싼댐옙.
- 占쏙옙占쏙옙: 占쏙옙占쏙옙占쏙옙크/占쏙옙튼 占쏙옙占쏙옙占쏙옙 占썩본占쏙옙 占쏙옙占쏙옙占?占쌤곤옙 占쏙옙占쏙옙占쏙옙 占쏙옙占쏙옙 占싸곤옙, fallback 占쌘듸옙占?占쏙옙占쏙옙 占싻놂옙 占쏙옙占쏙옙占쏙옙 占쏙옙占쏙옙 2占쏙옙 占쏙옙管罐占?占쏙옙占쏙옙占싼댐옙.

## 2026-04-05 (媛?占쎈뱶 ?占쎌텧 洹쒖튃/?占쎌씠?占쎌썐 ?占쏙옙???

### 60. 媛?占쎈뱶??諛뺤뒪??湲곕낯 ?占쎌텧 ?占쎌젏占??占쏀옒 吏??洹쒖튃??癒쇽옙? ?占쏀븯占?遺숈뿬???占쎈떎
- 泥ル궇?占쎈쭔 蹂댁뿬以섏빞 ?占쎈뒗 ?占쏙옙?留먲옙? 臾댁“占??占?占쎈맂 ?占쎌슜???占쏀깮 > 泥ル궇 ?占쏙옙? > 湲곕낯 ?占쏀옒 ?占쎌꽌占?怨꾩궛?占쎈떎.
- ??占??占쏙옙? 媛?占쎈뱶???占쎌슜?占쎈퀎 localStorage ?占쎈줈 ?占쏙옙??占쎌꽌 ?占쎌떆 ?占쎌퀜吏吏 ?占쎄쾶 ?占쎈떎.
- 媛ㅻ윭占??占쎈궡, ?占쎈떒/?占쎈룞/留덉쓬 鍮좊Ⅸ 湲곕줉泥섎읆 媛숋옙? ?占쎄꺽??諛뺤뒪??媛숋옙? ?占쏀옒 洹쒖튃???占쎌궗?占쏀븳??

### 61. 紐⑤컮???占쎌꽑 移대뱶 ?占쎌씠?占쎌썐???占쎌뒪?占쏀넲?占쎌꽌 ?占쎌떆 踰뚮━吏 留먭퀬 媛숋옙? 洹몃━???占쎈쫫???占쏙옙??占쎈떎
- ?占쎌슜?占쏙옙? 紐⑤컮??援ъ“占??占쏀샇?占쎈떎占?紐낆떆?占쎈㈃ ?占쎌뒪?占쏀넲??媛숋옙? 占?援ъ“(?? 3/2/2)占??占쏙옙??占쎈떎.
- ?占쎌뒪?占쏀넲 ?占쎌슜 2???占쎌씠??諛곗튂占?異뷂옙??占쎄린 ?占쎌뿉 ?占쎌젣 ??而⑦뀒?占쎈꼫 ??占쏙옙?????占쎌걶吏 癒쇽옙? 寃利앺븳??
- ?占쎌빟 移대뱶 ?占쎌씠??height/ min-height/ aspect-ratio占???踰덉뿉 ?占쎌씤?占쎌꽌 占?怨듦컙???占쎄린吏 ?占쎄쾶 ?占쎈떎.

### 62. ?占?占쎈낫???占쎈낫 援ъ“??湲곗〈???占쎌닕???占쎌꽌占??占쏙옙??占쎈㈃?????占쎌빟 移대뱶占??占쎌썙 ?占쎌뼱???占쎈떎
- ?占쎈떒 ?占쎌빟??諛뷂옙? ?占쎈룄 ?占쎌슜?占쏙옙? 諛섎났?占쎌꽌 蹂대뒗 ?占쎈뒛???占쎌쬆 ?占쏀솴, ?占쎈쾲 占??占쎈쫫, 二쇨컙 誘몄뀡, 留덉씪?占쏀넠 媛숋옙? ?占쎌떖 諛뺤뒪 ?占쎌꽌???占쏙옙?占??占쎄굅?占쏙옙? ?占쎈뒗??
- ??移대뱶媛 異뷂옙??占쎈㈃ 湲곗〈 ?占쎌떖 諛뺤뒪????占쏙옙蹂대떎 ?占쎈같移섓옙? ?占쎄린 泥섎━占??占쎄껐?占쎈떎.

### 69. 吏꾪뻾 ?占쎌빟 移대뱶??媛숋옙? ?占쎈낫占???占?留먰븯吏 留먭퀬, ?占쎄린 踰꾪듉?占?占?移대뱶 ?占쎈Ⅸ履쎌뿉占?遺숈뿬 濡쒖뺄?占쎄쾶 ?占쎌옉?占쏀궓??
- 利앹긽: 二쇨컙 誘몄뀡 移대뱶 ?占쎌뿉??`?占쎈쾲 占?誘몄뀡`, `2/3 ?占쎈즺`, ?占쎌꽭 吏꾪뻾瑜좎씠 ?占쎈줈 ?占쎈Ⅸ 諛뺤뒪?占쎌꽌 諛섎났???占쎈㈃???占쎈떟?占쎌죱??
- 援먰썕: 紐⑤컮???占쎌빟 ?占쎈㈃?占쎌꽌??`?占쏀깭 1占?+ ?占쎈룞 1占?占??占쎄린占? ?占쎄린 踰꾪듉?占??占쎌껜 ?占쎌뀡 ?占쎈뜑 ?占쎈Ⅸ履쎌뿉 ?占쏙옙? ?占쎌씪 踰꾪듉?占쎈줈 ?占쎈떎. ?占쎌쐞 移대뱶 ?占쎌뿉 媛숋옙? ?占쎌빟???占쎌떆 ?占쏙옙? ?占쎈뒗??

## 2026-04-06 (?? ?? ??)

### 71. ????? ?? ??? ?? ?? ?? plain text ??? ??? ?? ??? ???? markdown ??? ??
- ??: `C:\...` ??? plain text ??? ????? ?? ??? ?? ???? ??? ?? ?? ??.
- ??: ?? ??? ?? ??? ?? ?? `[??](C:/absolute/path.md)` ??? ???? markdown ??? ???.

### 72. Windows ?? ?? ??? `C:/...`? ??? `/C:/...` ????? ??? ??? ??
- ??: markdown ??? ??? `C:/...` ???? ??? ?? ??? ?? ???.
- ??: ? ???? ?? ?? ??? ??? `[??](/C:/path/to/file.md)` ???? ???.

### 73. ?? markdown ?? ??? ??? ???? ???? raw ????(`/C:/.../file.md`)? ?? ??
- ??: ???? `.md` ??? ??? ? ???? ???? ??? ?? ??? ???.
- ??: ?? ?? ??? ?? ?? ?? ?? ???? ????? ?? raw ???? markdown ??? ?? ????.

- ?? .md ??? ???? ? ??? ?? ??? ?? ASCII ?? ??? ?? ??? /C:/... raw ????? ????.

### 74. Keep destructive actions in one clear place per card flow
- When a summary row and a detail row describe the same pending item, place cancel in only one location.
- For social challenge cards, the summary row can show status, and the lower detail row can own the cancel action.

### 75. Mirror UI concurrency rules on the server
- If the modal disables a challenge type or filters out a busy friend, the callable must enforce the same rules.
- This prevents stale tabs or race conditions from creating invalid challenge combinations.

### 76. Save flows must read the current analysis state, not stale loaded data
- If AI analysis can be generated after the page loads, the save payload must be built from the current UI or refreshed cache.
- Reusing the originally loaded document can silently overwrite freshly saved analysis and break restore or gallery badges.

### 77. Mobile layout changes need screenshot-level checks, not just desktop logic
- If a new CTA uses a custom mobile media query, verify the stacked result on a narrow viewport before calling the layout done.
- Do not switch a compact two-row card to a single-column mobile layout unless the screenshot clearly proves that wrapping is better.

### 78. Event-gated install prompts need manual fallbacks on mobile
- If a first-screen install CTA depends only on beforeinstallprompt, iOS and many mobile browser contexts will never show it.
- Pair the native prompt path with manual install guidance, dismissal expiry, and a compact fallback state so the CTA remains discoverable.

### 79. Critical install CTAs should use persistent contextual surfaces
- If installation is a key action, place it in a stable CTA slot instead of a transient floating banner.
- Auto-dismissing or event-gated install banners are too easy to miss on mobile and too dependent on browser prompt timing.

### 80. Shared CTA helpers must not clobber special tab modes
- If a bottom CTA slot is reused across tabs, the shared update helper must explicitly skip tab-specific modes like install or community chat.
- Otherwise background guide refreshes can keep the old label while resetting the style and behavior underneath it.

### 81. Web push permission must be explicit and platform-aware
- Do not auto-call `Notification.requestPermission()` after login or page load.
- Keep web push opt-in behind a clear user action, and on iPhone require the installed home screen app path before asking for permission.

### 82. After editing browser entry modules, run the real browser bundle check
- A syntax error in `js/auth.js` can break login even if the rest of the app looks mostly unchanged.
- After touching auth or other top-level browser modules, run the esbuild bundle check immediately before reporting success.

### 83. Preserve UTF-8 when touching user-facing Korean strings
- If a JS file contains Korean UI copy, avoid shell rewrite patterns that can silently corrupt encoding into mojibake.
- After editing user-facing text, verify the actual rendered copy on staging or with a bundle check before calling it done.

### 84. Browser permission state and app push state are different UX problems
- A granted browser notification permission does not mean the app should always be actively subscribed to push.
- For simpler UX, keep browser permission as a prerequisite and offer a separate app-level one-tap push on/off toggle once permission is granted.

### 85. When browser settings block recovery, replace text walls with guided visuals
- If a web permission cannot be re-enabled in-app, do not leave users with a long paragraph or alert.
- Provide a browser-aware guide modal with a mocked visual path so users can map the instructions to what they see on screen.

### 86. Do not duplicate modal dismiss actions without distinct value
- If a modal already has one clear confirmation/dismiss CTA, avoid adding a second footer button that performs the same close action.
- Redundant close controls make simple guidance modals feel more complex than they are.

### 87. Install CTA visibility should track installed state, not just standalone mode
- If an install CTA is shown in a persistent bottom bar, hiding it only in standalone mode is not enough.
- On supported browsers, combine `appinstalled` memory with installed-app detection so browser tabs stop showing install guidance after installation, and let the CTA return only when the browser reports installation is available again.

### 88. Installed PWA copy must not keep saying "browser" when the user is in the app shell
- Android installed PWAs can still inherit blocked web notification permissions, but the UX should describe that state in app language first.
- If recovery still requires browser/site settings, explain that clearly in the helper or guide instead of showing a browser-only phrase on the main card.

### 89. Do not clear installed CTA state from install-available events alone
- `beforeinstallprompt` means the browser may offer installation, but it is not strong enough by itself to prove the app is no longer installed.
- Keep installed CTA suppression tied to actual installed-app detection or shared install state so browser tabs do not resurrect the install bar after installation.

## 2026-04-08 (share target import bug)

### 60. Non-picker image imports must not hard-fail on optional EXIF helpers
- Symptom: Android share-target opened the diet tab but showed `占싱뱄옙占쏙옙 占싻쇽옙 占쏙옙占쏙옙占?占쏙옙占쏙옙占싹댐옙.` and saved nothing.
- Root cause: shared files were routed through `smartUpload()`, which blocked the entire import when `EXIF` had not loaded yet.
- Lesson: share-target and other non-picker upload paths should accept raw `File` arrays directly and fall back to `lastModified` metadata when EXIF is unavailable. Optional analysis helpers must never block the basic save flow.

### 90. Native shell branding must reuse the real app icon from day one
- If the repo already has a production PWA/app icon, do not ship the Android shell with a placeholder launcher icon.
- Before sharing a test APK, verify launcher icon, app label, and other visible branding assets match the existing product brand to avoid duplicate-looking installs.

### 91. Adaptive launcher icons need inset-safe foregrounds
- Reusing the real product icon is not enough for Android launcher icons; adaptive icons crop the foreground inside a mask on many launchers.
- Before shipping a test APK, verify the launcher icon on a real Samsung/One UI device and keep text or logos away from the mask edges by using an inset foreground asset.


## 2026-04-08 (Android shell follow-up)

### 92. Android-only actions must live in always-visible task surfaces
- **Symptom**: The user could not find the Health Connect action because it was placed inside a collapsible guide row, and launcher entry did not always preserve the explicit Android-shell marker.
- **Lesson**: If an Android-specific action supports a primary workflow like step entry, place it inside the relevant working card near the input controls. Also stamp launcher entry with an explicit `native=android-shell` marker instead of depending on later deep-link flows.


## 2026-04-08 (mobile helper copy)

### 93. Bottom-bar helper copy should be written for one-line mobile fit first
- **Symptom**: The mind-tab save helper wrapped into two lines on Android because it tried to explain both readiness count and motivational guidance in the fixed bottom bar.
- **Lesson**: For the bottom save bar, prefer one compact sentence that communicates only the next action or readiness state. Treat longer motivational copy as optional and keep helper strings short enough for narrow mobile screens first.


## 2026-04-08 (Health Connect step alignment)

### 94. Generic Health Connect aggregates do not necessarily match a specific source app's visible total
- **Symptom**: The imported step count was much lower than the Samsung Health number shown on the same device.
- **Lesson**: For Activity data like steps, Health Connect aggregate reads can be deduped across apps and reflect sync timing rather than a single provider's UI total. If the product promise is "match Samsung Health," prefer Samsung Health's `DataOrigin` when available and label the imported source explicitly.


## 2026-04-08 (diet helper copy)

### 95. Fasting helper copy should describe the metric group, not the raw field count
- **Symptom**: The diet-tab save helper said things like `?? 4?`, which sounded unnatural and product-hostile even though it was technically counting filled fields.
- **Lesson**: For user-facing health copy, prefer the domain term such as `?? ??` over raw input counts unless the count itself is meaningful to the user.

## 2026-04-08 (Android share sheet)

### 96. A PWA share target does not make the Android shell appear in the native share sheet
- **Symptom**: The user could share images into the installed PWA earlier, but the debug APK itself did not appear in Samsung's app share list and looked like a regression.
- **Lesson**: Treat the PWA and the Android shell as separate share surfaces. If the Android APK must appear in the native share sheet, add the full TWA share-target contract on the Android side: share-target metadata, `SEND` and `SEND_MULTIPLE` intent filters, the Trusted Web Activity delegation service, and a matching asset links fingerprint set for the build being tested.

## 2026-04-08 (Android repeat regressions)

### 97. Source filtering alone is not enough to match Samsung Health step totals
- **Symptom**: After switching from generic Health Connect totals to Samsung Health-only aggregation, the Android shell still showed a lower step count than the Samsung Health app.
- **Lesson**: For Health Connect step sync, do not assume one aggregate query is the whole truth. Compare multiple views of the same day, including source-filtered aggregates and raw `StepsRecord` sums, and choose the best available value before labeling it as a Samsung Health import.

### 98. Do not re-tune a launcher icon that already passed on-device validation without rechecking the device result
- **Symptom**: The launcher icon looked correct in one verified APK, then regressed back to a face-only crop after a later inset tweak.
- **Lesson**: Once a launcher icon has been explicitly approved on the target device family, treat that asset/layout as locked. Any later icon adjustment must be justified by a new issue and followed by fresh device validation before shipping another APK.

## 2026-04-08 (onboarding and gallery engagement)

### 99. Signup onboarding must be gated by the actual signup event, not by a missing profile flag alone
- **Symptom**: An existing user saw the signup welcome modal again after installing the Android APK because `onboardingComplete` was missing in Firestore.
- **Lesson**: Treat onboarding as a one-time signup event, not a generic app-entry state. Show signup onboarding only when the current auth flow explicitly reports a fresh signup, and never re-trigger it just because a legacy profile field is absent.

### 100. Gallery engagement scores must count unique users per post, not raw interaction volume
- **Symptom**: Multiple comments on the same post and switching between reaction types could inflate gallery/community scores and reaction coin awards.
- **Lesson**: For anti-abuse scoring, count at most one qualifying comment and one qualifying reaction per user per post. Apply the same rule consistently in client rankings, backend community stats, and any point-award function.
## 2026-04-09 (?묒뾽 由ъ뒪???쒗쁽 援먯젙)

### 101. ?ъ슜?먯슜 ?묒뾽 由ъ뒪?몄뿉??湲곗닠 寃利??⑹뼱瑜?萸됰슧洹몃━吏 留먭퀬 ?ㅼ젣 ?뺤씤 ?됰룞?쇰줈 ??댁꽌 ?곷뒗??
- **利앹긽**: "share-sheet target, launcher icon inset, CTA behavior" 媛숈? ?쒗쁽? 援ы쁽?먮뒗 ?댄빐?대룄 ?ъ슜?먮뒗 臾댁뾿???ㅼ젣濡??뺤씤?댁빞 ?섎뒗吏 諛붾줈 ?뚭린 ?대졄??
- **援먰썕**: ?ъ슜?먯뿉寃?蹂댁뿬二쇰뒗 ?묒뾽 由ъ뒪?몄? 寃利??붿껌? "怨듭쑀 紐⑸줉???대튆?ㅼ엥???⑤뒗吏", "?깆씠 ?먰븯????쑝濡?諛붾줈 ?대━?붿?", "?쇱꽦 ?꾩씠肄섏씠 ?섎━吏 ?딅뒗吏"泥섎읆 愿李?媛?ν븳 臾몄옣?쇰줈 ?곷뒗?? 湲곗닠 臾띠쓬 ?쒗쁽? ?대? 硫붾え?먮쭔 ?④린怨? ?ъ슜??facing ??ぉ? plain language濡??ㅼ떆 ??댁벖??

---## 2026-04-09 (milestone hierarchy normalization)

### 102. Higher claimed milestones must implicitly close lower steps in the same category
- Symptom: Legacy users could see diet1, exercise1, or mind1 reappear as fresh +5P start rewards even though higher milestones in the same category were already completed or claimed.
- Lesson: Milestone rendering and reconciliation must treat each category as an ordered ladder. If a higher step is already achieved or claimed, all lower steps should be marked achieved too, and any lower step beneath a claimed milestone should be treated as already closed to avoid replaying starter rewards or events.

---
## 2026-04-09 (simple-mode copy length)

### 103. Simple-mode guidance copy must fit the actual card width, not just read well in isolation
- Symptom: The default mind guidance sentence in simple mode was understandable but long enough to clip on the larger accessibility-first card layout.
- Lesson: In simple or senior-facing surfaces, prefer short action copy that fits in one stable line block on common mobile widths. If two versions say the same thing, ship the shorter verb-first phrasing.
## 2026-04-09 (simple-mode chrome and guide density)

### 104. In simple mode, prefer one small escape hatch over a full explainer banner and keep guide cards action-only
- Symptom: The large simple-mode banner and guide-card status copy made the accessibility-first layout feel heavier than necessary even after shortening individual sentences.
- Lesson: For senior-facing or simple-mode screens, default to a small top-level escape hatch such as a single 湲곕낯 button in the header. Inside action cards, remove explanatory copy when the next action is already obvious from the button labels.
## 2026-04-09 (simple-mode action hierarchy)

### 105. In simple mode, button labels and color roles should carry the guidance instead of extra sentences
- Symptom: Even after removing guide copy, the action order and labels still felt less obvious until the primary actions were renamed and color-coded by intent.
- Lesson: For accessibility-first mobile flows, make the button stack self-explanatory. Put the most direct action first, use stable color roles such as green for immediate capture/input and orange for the secondary nudge, and normalize repeated wording like 媛먯궗 ?쇨린 everywhere users see it.
## 2026-04-09 (simple-mode header emphasis)

### 106. In simple mode, the brand header should stay more prominent than the escape button, and CTA copy should drop redundant category words
- Symptom: After simplifying the header, the top-right escape button label and the smaller brand text made the simple-mode entry feel less anchored, and the mind save CTA still read longer than necessary.
- Lesson: In accessibility-first headers, enlarge the brand icon/name and keep the mode-switch button secondary even when it remains visible. For save CTAs, remove redundant words like `record` when the current tab already provides that context.
## 2026-04-09 (simple-profile QR-first cleanup)

### 107. In simple profile surfaces, remove explanatory filler and prefer QR-first cards with the install action in the footer CTA
- Symptom: The first simple-profile version still had extra helper sentences, a link/copy row for invites, and the install action inside a content card, which made the screen feel busier than the user wanted.
- Lesson: For senior-facing simple profile screens, keep points prominent, collapse invite/community actions to large QR cards with a single short camera prompt, and move the install action to the bottom CTA instead of keeping it as another profile card.

## 2026-04-09 (simple-profile footer CTA state)

### 108. When reusing a shared footer CTA, keep the visible label and the internal action mode in the same tab-specific branch
- Symptom: The simple-profile footer still showed the install label, but a later generic submit-bar refresh reset `saveDataBtn.dataset.mode` back to `save`, so tapping the install CTA actually ran the save flow and surfaced unrelated errors.
- Lesson: If a shared footer button changes meaning by tab, handle that tab explicitly inside the common updater instead of only during the initial tab open. The text, classes, and `dataset.mode` must always be set together so a secondary refresh cannot leave the UI saying `install` while the click handler behaves like `save`.

## 2026-04-09 (simple-mode heading directness)

### 109. In simple mode, lead with the user task for that tab and remove redundant mode labels
- Symptom: The simple profile still opened with a `媛꾪렪 ?꾨줈?? chip, and the record tabs did not start with the clearest possible instruction even though the mode was already visually obvious.
- Lesson: For senior-facing simple mode, the first line of each screen should name the immediate action, like `?ㅻ뒛 ?앸떒 湲곕줉?섏꽭??, `?ㅻ뒛 ?대룞 湲곕줉?섏꽭??, or `?ㅻ뒛 留덉쓬 湲곕줉?섏꽭??. Do not spend the strongest visual slot repeating the mode name when the real job can be stated directly.

## 2026-04-09 (simple-mode critical actions)

### 110. Do not strip out core feature actions like AI analysis just because the layout is simplified
- Symptom: Simple mode hid the existing diet and sleep AI analysis buttons through a blanket CSS rule, so a core value feature disappeared even though the underlying analysis flow still existed.
- Lesson: When simplifying a senior-facing flow, remove clutter first but keep high-value primary actions visible. If an action is central to the product promise, preserve it in simple mode and restyle it to be clearer rather than hiding it with broad layout rules.

## 2026-04-09 (profile hydration after mode switches)

### 111. Do not trust the first user-doc read alone when profile UI depends on points or referral state
- Symptom: After switching between `/simple` and the default mode, profile surfaces could show `0P` and empty invite QR blocks until the user manually refreshed because the first auth-time user document read sometimes arrived without the latest profile fields.
- Lesson: For auth bootstrap and mode-switch entry, if the visible UI depends on fields like `coins` or `referralCode`, re-check the user document against fresh server state before treating the account as new or finalizing the profile UI. After that fetch, explicitly rehydrate the currently visible profile surfaces instead of assuming a later refresh will fix them.

## 2026-04-09 (localhost emulator restarts and data loss)

### 112. Before restarting localhost Firebase emulators, warn that local Firestore state may reset unless an import/export flow is configured
- Symptom: Restarting the local Firebase stack to recover `127.0.0.1:5000` also restarted Firestore, and localhost then showed `0P` because this project's emulator startup does not import persisted user data by default.
- Lesson: When the user is validating localhost behavior, do not restart the full emulator set casually. First check whether only Hosting is down. If Firestore is already serving the expected local state, keep it alive and recover only the missing piece. If a full restart is necessary, tell the user up front that localhost uses emulator data and may lose the current local points/profile state unless a seed or export is restored.

## 2026-04-10 (challenge rules copy)

### 113. User-facing challenge rules should describe the user outcome first, not the internal policy shorthand
- Symptom: A compact wallet challenge note using phrases like `65P+ ?몄젙`, `phase 蹂대꼫??, and `50% 諛섑솚/50% ?뚭컖` was technically accurate but too dense for a user to understand at a glance.
- Lesson: For challenge rewards and staking copy, avoid operator shorthand in the primary UI. Lead with the simple flow users care about, such as `?섎（ 65???댁긽?대㈃ 1???몄젙`, `80% ?댁긽?대㈃ ?덉튂湲덇낵 ?ъ씤?몃? ?뚮젮諛쏆븘??, and `?꾨? ?ъ꽦?섎㈃ HBT 蹂대꼫?ㅺ? ??遺숈뼱??.
## 2026-04-10 (challenge card copy deduplication)

### 114. When neighboring challenge cards share the same rule, keep the shared part minimal and let only the reward difference stand out
- Symptom: The weekly and master card subtitles repeated the same long qualifier about new starts and daily minimum points, so the two cards looked wordy even though the practical difference the user needed was just `100P` versus `500P`.
- Lesson: For side-by-side challenge summaries, compress the common rule into the shortest understandable phrase, such as `?섎（ 65???댁긽 쨌 80%+ ?섍툒`, and use the remaining space to emphasize the distinct reward value instead of repeating the same condition twice.

## 2026-04-10 (tokenomics page encoding safety)

### 115. After bulk documentation edits, verify the actual served HTML page instead of trusting only the markdown source or git diff
- Symptom: `HBT_TOKENOMICS.md` stayed readable, but `tokenomics.html` was committed with broken Korean text and the staging page visibly rendered garbled copy.
- Lesson: When a public document exists in both markdown and HTML, validate the HTML bytes and the served page before closing the task. If one source is corrupted, restore from the last known-good revision and then reapply only the intended textual changes in small, reviewable edits.

## 2026-04-10 (wallet and tokenomics copy alignment)

### 116. When a policy number changes, update the wallet fallback text and tokenomics docs together so the user never sees mixed limits
- Symptom: Runtime code already used a `12,000 HBT` daily cap, but the wallet's initial HTML and tokenomics docs still showed `5,000 HBT`, which made the product look inconsistent.
- Lesson: Any change to a user-facing policy number like an HBT cap must be reflected in the runtime constant, wallet fallback HTML, and tokenomics pages/docs in the same pass. If the product wants the current rule shown plainly, do not keep legacy qualifiers like `?좉퇋` in the primary UI copy.
## 2026-04-10 (tokenomics update stamp)

### 117. When public tokenomics content changes, update the visible "理쒖쥌 ?낅뜲?댄듃" stamp in both the HTML page and the source docs in the same pass
- Symptom: The tokenomics content had been revised, but the visible update stamp still showed `2026??3??31??, making the page look stale even after recent policy changes.
- Lesson: Treat the tokenomics update date as part of the shipped content. When copy or policy changes on the page, update the visible stamp in `tokenomics.html` and the mirrored source documents together before closing the task.
## 2026-04-10 (external dashboard certainty)

### 118. Do not state third-party dashboard security options as facts unless they are confirmed in current docs or UI
- Symptom: I advised setting a MetaMask Developer domain allowlist as if it were definitely available, but the current official docs and visible dashboard state did not clearly confirm a separate origin allowlist control.
- Lesson: For third-party developer consoles, verify the exact current UI or official docs before giving step-by-step security instructions. If a control is not confirmed, say so explicitly and only recommend settings that are actually visible or documented.

## 2026-04-10 (mobile wallet return flows)

### 119. When a mobile wallet handoff leaves the browser and returns later, do not rely on a single immediate recovery check
- Symptom: After approving MetaMask from the app, the browser returned to HaBit but the wallet UI stayed unchanged because recovery checked `eth_accounts` only once, before the SDK finished restoring the session.
- Lesson: For mobile wallet deeplink or WalletConnect returns, combine a short retry window with provider event listeners like `connect`, `accountsChanged`, and `chainChanged`. Restored sessions can arrive slightly after focus returns, so the UI must react to late events instead of assuming recovery is synchronous.

### 120. Do not delay wallet bootstrap so long that a post-approval browser return looks like a no-op
- Symptom: Mobile wallet approval could reload the browser tab, but wallet initialization still waited 10 seconds after login, so the user came back to an apparently unchanged wallet card.
- Lesson: If an external wallet handoff is pending, initialize wallet recovery almost immediately after auth resumes. Heavy blockchain tasks can stay delayed, but the visible wallet state must rehydrate quickly enough that the user sees the connection take effect.

### 121. Do not ship mobile wallet popup bridges that surface raw `about:blank` tabs to users
- Symptom: A workaround that pre-opened a blank browser tab kept the wallet launch tied to the original click, but on real devices it visibly showed an `about:blank` page and looked more broken than the original issue.
- Lesson: For mobile wallet handoffs, prefer same-tab deeplinks or clearly branded helper pages. Never expose a raw blank bridge tab in production UX, even if it improves popup reliability in theory.

### 122. Treat wallet in-app browsers as a fallback, not a default, until session continuity is proven
- Symptom: External-browser return flows were flaky enough that an in-app browser pivot looked attractive, but in a login-gated app that pivot introduced a larger product bug by dropping the authenticated session.
- Lesson: When mobile wallet return flows fail, do not jump straight to the wallet's in-app browser. First ask whether the app can preserve login continuity there. Only use the in-app browser as a primary path if authentication and state handoff are intentionally supported.

### 123. Do not pivot a login-gated app into wallet in-app browsers unless an auth handoff is explicitly designed
- Symptom: Sending HaBit into the MetaMask or Trust Wallet in-app browser broke the product model itself, because the user would lose the existing Firebase-authenticated session and land in an unauthenticated copy of the app.
- Lesson: Before adopting an in-app browser wallet flow, check whether the product depends on an existing login session. If the answer is yes, keep the wallet connection in the original browser unless you have implemented a deliberate auth handoff mechanism.

### 124. When adding a new wallet connection path, verify the actual button handler invokes that path
- Symptom: MetaMask Connect and Trust WalletConnect logic had been implemented, but the exported button handlers still called the generic injected-wallet function, so the new code never ran on real devices.
- Lesson: After adding alternative connection code, verify the public entrypoints used by the UI buttons call it in the intended environments. Do not assume helper functions are live just because they exist in the file.

### 125. For Trust Wallet mobile browser handoff, prefer the proven `link.trustwallet.com/wc?uri=` pattern over custom schemes
- Symptom: A custom `trust://` deeplink produced `ERR_UNKNOWN_URL_SCHEME`, while a working production site used `https://link.trustwallet.com/wc?uri=...` and recovered correctly after wallet approval.
- Lesson: When a live production reference and wallet docs converge on a specific deeplink pattern, copy that pattern instead of inventing a custom scheme. Validate mobile wallet handoff against a known-good implementation before shipping.

### 126. When debugging a PWA on staging, ship runtime cache-busting with behavior fixes or users may keep seeing the old bug
- Symptom: The wallet connection code changed repeatedly, but the user still experienced the same behavior because `app.js` and `main.js` version strings stayed unchanged, dynamic `blockchain-manager.js` imports had no version query, and the service-worker cache name was not bumped.
- Lesson: For staging fixes that depend on updated browser code, bump the visible script version, version any dynamic imports involved in the flow, and rotate the service-worker cache name in the same patch. Otherwise a user can truthfully report ?쐍othing changed??even when the repository diff is correct.

### 127. Do not force a full-page reload after popup auth success unless the product truly depends on it
- Symptom: On staging mobile browsers, Google popup login completed account selection but the app stayed on the landing screen because the code forced `window.location.reload()` both after `signInWithPopup()` resolved and again inside `onAuthStateChanged()`.
- Lesson: For popup-based Firebase login, let `onAuthStateChanged()` finish the signed-in UI transition naturally. A forced reload can race persistence in mobile browsers and erase the visible login success. If duplicate clicks are the concern, disable the login button while the popup is in flight instead of reloading the page.

### 128. Do not override a wallet SDK's browser deeplink handler with a React Native-style hook unless web behavior is proven
- Symptom: MetaMask mobile connection still felt inert because the app replaced the SDK's own browser deeplink/universal-link opening logic with a custom `preferredOpenLink` callback that was intended more for React Native environments than for Samsung Internet or Chrome.
- Lesson: On the web, prefer the wallet SDK's built-in browser deeplink flow first. Only override the open-link handler if the official web path is known to be broken and the replacement is verified on a real device.

### 129. For mobile WalletConnect retries, prefer a fresh provider per tap over reusing a warmed singleton
- Symptom: Trust Wallet taps could still feel like no-ops because a reused provider instance could carry a stale half-open WalletConnect state from an earlier failed attempt.
- Lesson: When a mobile WalletConnect flow is click-driven and user-facing, create a fresh provider for a fresh tap unless you are explicitly recovering an existing pending session. Reusing a warmed singleton is fine for reconnect recovery, but it is risky as the default for first-time connection attempts.

### 130. Do not spend the first mobile wallet tap loading SDK bundles or forcing custom URI schemes unless the official web defaults are proven wrong
- Symptom: MetaMask and Trust Wallet buttons still felt inert on Samsung Internet because the click path was paying for module/client setup before reaching the actual connect call, MetaMask was still forced onto the `metamask://` scheme, and Trust Wallet had drifted from the provider's documented `optionalChains` init path.
- Lesson: For mobile wallet launch flows, preload SDK bundles before the user taps, stay close to the wallet SDK's documented web defaults, and only force custom schemes or non-default init options after they are proven necessary on a real device.

### 131. After repeated real-device reports of ?쐍o improvement,??stop claiming progress and explicitly pivot or pause
- Symptom: Several staging redeploys changed wallet connection internals, but the user still experienced the same no-op behavior on the phone. My responses focused too much on what changed in code, not on the fact that the user-facing result had not improved.
- Lesson: For device-specific UX bugs, the only meaningful progress is observable behavior on the user?셲 device. If two or more rounds still produce ?쐍othing changed,??stop iterating on the same implementation path, say clearly that the current approach has not been solved, and propose a new architecture or a pause instead of implying the latest patch should fix it.

### 132. When a high-friction advanced feature is failing, do not keep presenting it as the default path in the main product UI
- Symptom: External wallet connection was unreliable on the target mobile browsers, but the wallet card still framed MetaMask and Trust Wallet as the primary next step, which made the product feel broken even though the app wallet flow itself worked.
- Lesson: If an advanced flow is not reliable enough for the core audience, move it out of the primary path. Update the main UI copy so the working default is unmistakable, and keep advanced actions secondary until the experience is proven on real devices.

### 133. For popup auth on mobile browsers, do not make the first visible signed-in transition depend entirely on `onAuthStateChanged()`
- Symptom: Google popup login technically succeeded, but Samsung Internet could still sit on the landing screen after account selection because the opener tab waited for the auth-state event before hiding the login modal and revealing the signed-in shell.
- Lesson: When popup auth resolves successfully, bridge the opener tab into a lightweight signed-in shell state immediately, then let `onAuthStateChanged()` finish the full hydration. This preserves correctness while removing the ?쏧 chose an account and nothing happened??feeling on slower mobile browsers.

### 134. When an experimental integration is removed from the product path, delete its heavy browser assets too
- Symptom: External wallet connection had already been de-prioritized in the UI, but the large MetaMask/WalletConnect browser bundles were still shipped and cached, which pushed Android site data to roughly 4.6MB even though users could no longer benefit from those assets.
- Lesson: After a feature pivot, remove the dead runtime imports, vendor bundles, package scripts, and cache references in the same pass. Otherwise the product keeps paying the storage and cache cost of an abandoned experiment.

### 135. Background uploads must not hijack the save CTA before the user actually presses save
- Symptom: Selecting an exercise video immediately changed the main save button to a `saving... XX%` state, which made it feel like the record was already being saved before the user pressed `?대룞 ??ν븯怨??ъ씤??諛쏄린`.
- Lesson: Background media uploads can start early for performance, but their progress should stay internal until the user presses the save CTA. Only after save begins should upload progress be reflected in the visible button text or save-state UI.

### 136. User-facing update notes should use plain language first, not internal engineering terms
- Symptom: The changelog wording used terms like `fail-fast`, `mainnet readiness`, and other internal phrases that make sense to engineers but feel hard to scan for regular users.
- Lesson: For release notes, prefer short user outcomes over implementation terms. Write what changed in everyday language, and keep technical details for internal docs rather than the public update page.

### 137. When changing an admin ranking metric, update every related admin view and summary card to the same source of truth
- Symptom: The economy tab TOP 20 was changed to a combined `points + HBT` ranking, but the dashboard TOP 5 and headline stats still used older per-field shortcuts, so operators saw inconsistent ordering and misleading totals.
- Lesson: For admin/ops surfaces, treat ranking logic and KPI cards as one package. If the ranking formula or source data changes, update the dashboard summary, detail table, and supporting stat cards together so the control tower never shows mixed definitions.

### 138. After patching `admin.html`, verify the extracted module script directly before assuming the control tower login still works
- Symptom: The control tower Google popup could complete, but the page stayed on the login screen because `admin.html` had stray braces and a broken inline module block around the admin auth helpers.
- Lesson: `admin.html` does not go through the main app bundle, so `app.js` and `main.js` build checks are not enough. After any manual edit to the control tower page, extract the module script from the raw file bytes and run `node --check` on it before deploying. Avoid `Get-Content`-based extraction when the file contains Korean text, because PowerShell encoding can create false negatives during syntax verification.

### 139. On BSC mainnet, wallet transfer history must not depend on the default dataseed RPC for `eth_getLogs`
- Symptom: The HBT wallet history UI shipped a merge path for real onchain inflow/outflow, but prod still showed only challenge staking rows because `getHbtTransferHistory` kept failing with `method eth_getLogs in batch triggered rate limit` / `limit exceeded`.
- Lesson: For BSC mainnet history features, prove the chosen RPC can serve `eth_getLogs` before shipping. Do not assume the default `bsc-dataseed.binance.org` endpoint is suitable for transfer-history scans. Use a history-safe fallback provider order, keep `eth_getLogs` sequential/non-batched, and verify with a real wallet address that recent transfers are returned before deploying.

### 140. Wallet asset cards must preserve the last known balances and retry in the background instead of blanking on transient reads
- Symptom: The points/HBT cards would occasionally show missing data until the user refreshed several times.
- Root cause: `updateAssetDisplay()` treated a timed-out Firestore read like an empty user doc, replaced visible HBT with a loading placeholder, and gave up after a single failed onchain read.
- Lesson: For balance surfaces, never clear good values just because one live read is slow or transiently fails. Cache the last known points/HBT values, render them immediately, and retry failed Firestore/onchain balance reads in the background before asking the user to refresh.

### 141. Mainnet HBT history RPC fallbacks must treat provider block-range limits like retryable scan shrink signals
- Symptom: The live wallet stayed stuck on only challenge staking rows even after the onchain history merge shipped.
- Root cause: `getHbtTransferHistory` only recognized classic rate-limit messages, but providers such as `1rpc.io/bnb` fail large `eth_getLogs` scans with messages like `limited to 0 - 10000 blocks range`. That bypassed the chunk-shrink path and left the wallet with empty onchain transfer results.
- Lesson: In HBT transfer history scans, classify provider block-range-limit errors as retryable alongside rate limits. Read `error.error.message` as well as top-level messages, then shrink the scan chunk instead of falling through to an empty history.

### 142. Post-save gallery refreshes must preserve cached feed items until Firestore catches up
- Symptom: Right after uploading a photo or video, moving to the gallery tab could show an empty feed even though the save had succeeded.
- Root cause: the save flow cleared `cachedGalleryLogs` immediately and relied on an asynchronous gallery reload to repopulate it. Users who switched tabs before that fetch completed landed on a blank cache.
- Lesson: For save -> gallery flows, never wipe the feed cache before the replacement data arrives. Optimistically upsert the saved record into the gallery cache, render from the last known cache first, and treat background refresh failures as non-destructive when cached content already exists.

### 143. Browser handoff flows must not treat one transient chatbot API failure like a lost connect token
- Symptom: Entering the app from the KakaoTalk Haebit Coach `!연결` button could land on a connect warning even though the URL token handoff itself was intact.
- Root cause: the app already preserved the full URL during the in-app-browser -> external-browser transition, but the client made a one-shot request to the chatbot server. If the Render service was still waking up or the handoff network was briefly unstable, the UI looked like a lost-connection problem.
- Lesson: For cross-browser handoff flows, distinguish “token lost” from “token lookup temporarily failed.” Keep the handoff token in the URL, add timeout/retry behavior around token lookup/completion calls, and only surface terminal errors when the server has actually rejected the token.

### 144. When a fix lives only in `functions`, a hosting-only deploy does not change the live behavior
- Symptom: the HBT 거래 기록 UI stayed unchanged even after later prod deploys, because it still showed only challenge staking rows.
- Root cause: the actual fix (`c35c990`) was server-only in `functions/index.js`, but subsequent deploys were `hosting` only. We mentally bundled the feature with the UI and overlooked that the live callable never changed.
- Lesson: For mixed client/server features, explicitly record whether the fix is `hosting`, `functions`, or both. Before telling the user a live bug should be fixed, confirm that the changed surface was actually deployed to the right Firebase target.

### 145. Daily media saves must preserve existing items and decouple document save from long-running uploads
- Symptom: uploading a new photo or short video could take too long, and in some cases previously saved media for the same day disappeared after saving.
- Root cause: the save flow awaited pending uploads end-to-end before writing the daily log, and exercise media lists were rewritten from the current DOM snapshot without a stable item identity or a preserve-unless-deleted merge.
- Lesson: For media-heavy diary flows, treat upload and document save as separate stages. Save the log immediately with the latest known persisted media, continue unresolved uploads in the background, and merge media arrays by stable item ids so existing content stays until the user explicitly removes it.

### 146. Long-running media uploads must expose per-file progress instead of generic warnings or invisible background state
- Symptom: asking users not to refresh or just telling them an upload is running still left too much uncertainty, especially for short videos that can take noticeably longer than photos.
- Root cause: the app already tracked per-input upload progress internally, but that state only fed the save CTA and a generic background chip. The actual photo/video slot gave no immediate feedback about how far each file had progressed.
- Lesson: When client-side uploads can take more than a moment, surface progress on the exact media slot the user just selected. Show percent + complete/error state per file, and start the upload only after validation passes so users never pay for an upload they cancelled.

### 147. Save reconciliation must not clear unresolved background uploads before their Firestore patch finishes
- Symptom: a sleep photo could show `일부 업로드 실패`, then a second save would look successful, but the media still disappeared after refresh.
- Root cause: the immediate post-save reconciliation path called `persistSavedPreview` / `persistSavedExerciseBlock` even when the Storage upload was still pending. Those helpers cleared `_pendingUploads` and the file input before `runBackgroundMediaSyncJobs()` could resolve the upload result and patch Firestore.
- Lesson: When save and upload are decoupled, reconciliation helpers must preserve unresolved pending uploads. Only clear the pending entry and file input after a real Storage URL exists or the upload has conclusively failed.

### 148. Background media pipelines need an explicit in-slot intermediate state once the original file exists but the final thumbnail does not
- Symptom: even after the overall upload flow was improved, the user still had to ask why a photo/video slot could look unfinished after upload because the UI did not clearly distinguish `original uploaded, thumbnail still preparing`.
- Root cause: I focused on the floating/global upload status and backend timing, but the media slot itself did not explain the remaining step. For videos especially, a placeholder frame alone does not communicate whether the upload is still running or just the thumbnail is pending.
- Lesson: Whenever media saving has a post-upload thumbnail/finalization phase, show that phase directly inside the affected slot with a clear label like `썸네일 제작중`. Do not rely only on a global progress card or generic placeholder imagery to explain that intermediate state.

### 149. Do not rely on canvas extraction from persisted Firebase Storage videos for core preview UI
- Symptom: a saved strength video could suddenly fall back to the generic placeholder, and the console showed CORS errors against `firebasestorage.googleapis.com`.
- Root cause: I treated "saved video with no thumb URL yet" as something the client could always recover by drawing the remote video into a canvas. Firebase download URLs do not reliably allow that CORS path, so the fallback was not dependable.
- Lesson: For persisted video preview UI, never make cross-origin canvas extraction the primary recovery path. Prefer a stored thumb URL, a local extracted frame, or an actual `<video>` element fallback that can show the frame without requiring canvas access.

### 150. Multi-mode media previews must be overlaid in one frame, not appended as separate blocks
- Symptom: after adding a `<video>` fallback for saved exercise cards, the preview could render as two stacked surfaces instead of one media frame.
- Root cause: I added both `<img>` and `<video>` elements into the preview shell but left them in normal document flow. When visibility toggles were not enough to guarantee exclusive layout, the elements could stack vertically.
- Lesson: For previews that can switch between image and video renderers, define the shell as a fixed-ratio positioned frame and absolutely overlay each renderer inside it. Never rely on sequential block layout for mutually exclusive preview surfaces.

### 151. If a just-extracted media thumbnail matters after save, persist a client cache keyed by the final media URL
- Symptom: after removing the cross-origin canvas fallback, a saved exercise video could still lose its visible thumbnail and fall back to a black or generic preview even though the client had already extracted a usable local frame earlier in the session.
- Root cause: I treated `data-local-thumb` as purely DOM-local state. Once the card was rebuilt from saved data, that state was gone unless a remote `videoThumbUrl` had already arrived.
- Lesson: When an upload flow extracts a valuable local thumbnail before the remote thumb is finalized, cache it client-side against the eventual persisted media URL and consult that cache during later rehydration. Do not throw away user-visible preview assets just because the DOM was recreated.

### 152. “Original URL exists” is not the same as “media upload is fully settled”
- Symptom: a saved exercise video kept reopening without a thumbnail even after multiple UI fallback tweaks, because `videoThumbUrl` was never written back to Firestore.
- Root cause: the save flow treated `_pendingUploads.result.url` as if the whole media pipeline was complete. When the original upload had finished but `thumbPromise` was still running, we skipped background patch scheduling and cleared the pending entry too early.
- Lesson: In split upload pipelines, model “original done / thumbnail pending” as its own live state. Keep the pending entry, schedule the background patch, and only mark the media fully settled after the thumbnail promise has either produced a persisted thumb URL or definitively failed.

### 153. When old data is already missing a thumbnail, the UI should degrade gracefully instead of advertising work it is not doing
- Symptom: on refresh, an old exercise video with no persisted `videoThumbUrl` showed `썸네일 제작중`, then a live frame appeared seconds later, while the gallery share card rendered an ugly placeholder tile.
- Root cause: I mixed “actively generating a new thumb” with “showing a live video fallback because a thumb is absent.” Those are not the same user state, especially for records already saved in broken form.
- Lesson: If the app is merely falling back to a live video frame for an old thumb-less record, hide processing copy once the frame is visible and omit that media from thumbnail-first surfaces like share cards until a real preview asset exists.

### 154. Share-card media caches must be invalidated when late thumbnails arrive
- Symptom: the exercise tab or gallery feed could recover a strength-video thumbnail, but the gallery's “해빛 루틴” share card kept showing an older placeholder tile.
- Root cause: the share card prepared its own media payload and cached that result separately from the normal gallery media render path. Later local-thumb binding or background thumb patching updated the preview surfaces, but never invalidated the share-card cache.
- Lesson: When a late thumbnail changes the visual media set, invalidate every downstream cache that depends on it, not just the obvious on-screen preview. For Habitschool, that includes the prepared share-card media cache as well as the gallery feed item.

### 155. Share-card collectors must not drop videos before async thumbnail recovery gets a chance
- Symptom: the gallery feed could still show or recover a strength-video preview, but the “해빛 루틴” share card omitted or placeholdered the same video because it never attempted the later local-thumb recovery path.
- Root cause: `collectShareCardMedia()` only added strength videos when a synchronous thumb source (`localThumb` or `videoThumbUrl`) already existed. If the thumb lived only in slower persistent client cache, the share-card preparation stage never saw the video item at all.
- Lesson: For media that can recover thumbnails asynchronously, collect the media item from its stable original URL first, then resolve the preview asset in the async preparation phase. Do not require a synchronous preview source at collection time.

### 156. Browser-local thumbnail caches do not solve cross-device share-card previews
- Symptom: a strength-video tile could still show a placeholder in the desktop gallery share card even after we cached local thumbnails successfully on the uploading device.
- Root cause: the local thumbnail cache lived only in that specific browser profile. When the user uploaded on mobile and later inspected the share card on desktop, there was no local cached frame to reuse, and missing `videoThumbUrl` left the server callable with nothing image-like to return.
- Lesson: For share surfaces that must work across devices, client-only thumbnail caches are just an optimization. Always provide a server-visible fallback, either by persisting `videoThumbUrl` reliably or by generating a thumbnail from the stored video object when the share asset is requested.

### 157. List-first exercise restore paths must inherit matching legacy thumbnail fields during schema transition
- Symptom: the exercise tab and the gallery share-card preview could render a black video frame or placeholder even though the daily log still contained a valid legacy `strengthVideoThumbUrl`.
- Root cause: newer UI paths preferred `exercise.strengthList` and ignored the older `exercise.strengthVideoThumbUrl`. When save flows wrote a list item without `videoThumbUrl` but preserved the legacy fields, the renderers threw away an already saved thumbnail.
- Lesson: When a media schema evolves from single-item fields to list items, any list-first restore path must reconcile missing per-item thumbnails against matching legacy fields before falling back to live video rendering or placeholder assets.

### 158. Samsung Internet should use redirect auth when Google popup login behaves like a stranded extra tab
- Symptom: on first login in Samsung Internet, choosing a Google account could leave the user on the Google/Firebase auth surface or require a back action / second tap before the app felt signed in.
- Root cause: `signInWithPopup()` behaves more like a separate tab on Samsung Internet, so even with opener-side shell bridging the login can feel incomplete or require manual return. The app also lacked a persistent pending-login recovery path for when auth completed while the browser was switching focus.
- Lesson: For Samsung Internet, prefer `signInWithRedirect()` over popup auth. Pair it with redirect-result recovery and a short-lived pending-login marker so the app can resume the signed-in shell immediately when the browser returns.

### 159. Simple-mode guidance copy should keep only the action, not scaffolding around it
- Symptom: the first simple-profile guidance version still carried extra framing text like `여기서 시작하세요` and category labels, which made the top of the screen feel busier than the user wanted.
- Root cause: I optimized for explicit explanation instead of preserving the minimum action cue that the user actually asked for.
- Lesson: In simple-mode guidance, default to the shortest actionable phrase and use visual affordances like arrows for context. If the action already points at the target tabs, remove redundant heading and category labels.

### 160. Persistent install CTAs should be gated by browser context, not by mobile-only assumptions
- Symptom: after restoring the missing `installState.visible` gate, the `해빛스쿨 앱 설치` footer disappeared entirely on a normal desktop browser that was not installed.
- Root cause: `shouldShowInstallCta()` still hard-blocked all non-mobile user agents and also depended on stored installed-state hints, which contradicted the user’s expectation of a persistent install CTA surface.
- Lesson: For Habitschool’s bottom-bar install CTA, treat “browser vs installed standalone app” as the primary distinction. If the app is running in a normal browser and not localhost, keep the install CTA visible and let the action branch into native prompt or manual guidance as needed.

### 161. When a simple-mode guide is reduced to one line, emphasize it with size and centering
- Symptom: after shortening the simple-profile guidance to a single phrase, the message still felt too quiet because it kept the same small left-aligned treatment as a longer paragraph.
- Root cause: I simplified the copy but left the visual hierarchy tuned for multi-line explanatory text.
- Lesson: If a simple-mode guide is only one short action line, increase the type size and center it so the message feels intentional rather than leftover body copy.

### 162. Optional onchain enrichment on a core asset screen should be removable when it becomes the unstable part
- Symptom: the asset tab mixed a stable Firestore-backed HBT history with a slow/failing onchain callable, which produced 504/CORS-looking console noise and made the screen feel like basic information was missing.
- Root cause: I kept treating the onchain transfer lookup as mandatory enrichment even after the user decided the extra scan was not worth the instability. That left a secondary feature in the critical rendering path.
- Lesson: When a screen already has a stable primary data source, keep optional onchain enrichment behind a clean boundary. If that enrichment becomes the unstable piece and the user prefers stability, remove it cleanly instead of continuing to tune around it.

### 163. Deferred-upload tabs must not consume the transfer before the floating tracker starts
- Symptom: the strength-video bottom upload bar appeared only near the end, even though the actual upload had been running for a while.
- Root cause: I still awaited the original video upload URL in the save path before I queued the “background” job, so by the time the floating tracker started there was almost no transfer left to show.
- Lesson: If a tab is meant to behave like the app’s deferred-upload flows, do not block the save path on the original media URL first. Queue the background job while the transfer is still in flight so the tracker reflects real upload progress from the start.

### 164. Video upload completion should include deferred thumbnail patching
- Symptom: the UI could say the background upload was complete while a strength-video thumbnail was still missing or still being patched.
- Root cause: I ended the floating tracker after the primary media patch and treated late thumbnail persistence as an invisible afterthought.
- Lesson: For video media, keep the completion state and progress tracker open until deferred thumbnail patching settles. Otherwise the app declares success before the preview surface is actually done.

### 165. Exercise-tab media restore must reuse the same thumbnail recovery path as post-save patches
- Symptom: the gallery could show a usable strength-video thumbnail, but the exercise tab still rendered a blank/placeholder preview for the same saved record.
- Root cause: I let the exercise-tab initial restore keep a separate lighter-weight preview branch, while the stronger thumbnail recovery logic lived in `persistSavedExerciseBlock(...)`. The two surfaces drifted apart.
- Lesson: When a media surface already has a battle-tested post-save restore function, reuse it for initial data hydration too. Do not maintain a second, simpler restore path for the same media type.

### 166. Live video fallbacks should not hide the placeholder before the first frame is ready
- Symptom: a saved strength-video without a persisted thumbnail could appear blank in the exercise tab even though the fallback video source was valid.
- Root cause: `showStrengthPreviewVideo(...)` hid the placeholder image immediately and only then waited for video events, so any delay or browser-specific frame behavior produced an empty preview.
- Lesson: For video-preview fallbacks, keep the placeholder or prior image visible until the first renderable video frame is confirmed. Only swap surfaces after `loadeddata`/equivalent readiness proves the frame exists.

### 171. Android installed-app cold starts must keep a branded loading state until the browser shell is actually visible
- Symptom: after fixing the hard launch failure, tapping the installed APK could still feel broken because Chrome/TWA cold start spent several seconds on a blank white surface before the web app appeared.
- Root cause: I treated “browser launch requested” as equivalent to “the user now sees meaningful app UI.” In reality, Chrome first-run prompts and slow custom-tab startup can leave a long white gap after the native handoff.
- Lesson: For Habitschool’s Android shell, never hand users directly from the launcher into an unstyled browser cold-start gap. Keep a visible branded loading screen until the trusted surface is ready enough to take over, and pre-warm the custom-tab provider before launching.

### 172. Browser fallbacks must exclude the app's own verified-link package or they can loop back into the launcher
- Symptom: even after adding a visible loading shell, the installed Android app could still appear frozen on white because the timeout fallback reopened `com.habitschool.app/.HabitschoolLauncherActivity` instead of a real browser.
- Root cause: I fired a plain `ACTION_VIEW` intent for `https://habitschool.web.app/...` while the app itself had a verified-link intent filter for the same host. Android resolved the fallback back into the app, creating a self-loop.
- Lesson: If an Android shell claims the same web origin via app links, any “open in browser” fallback must explicitly resolve an external browser package and exclude the app package. Never assume a bare `ACTION_VIEW` on your own domain will escape the app.

### 173. Hosted APK links must never depend on ephemeral build-output paths
- Symptom: the shared `/install/android.apk` URL could suddenly return `page not found` after a web-only staging deploy, even though the link itself had not changed.
- Root cause: Firebase Hosting redirected the install URL straight to `android/app/build/outputs/apk/debug/app-debug.apk`, but temp worktree deploys did not always contain that untracked build artifact.
- Lesson: Serve APK downloads from a stable hosted path such as `install/android.apk`, and make deploy-time automation prepare that file before Hosting uploads. Do not expose raw local build-output paths as public install URLs.

### 174. Do not “fix” TWA launcher issues by routing the primary app entry into a normal browser tab
- Symptom: the installed Android app finally opened, but the top chrome became thick and the address bar was visible, which broke the expected app-like shell.
- Root cause: I treated the white-screen launcher problem as a reason to send `ACTION_MAIN + CATEGORY_LAUNCHER` straight into a normal browser surface. That changed the product surface from TWA to regular Chrome. On top of that, the timeout budget started before warmup and could still auto-open browser fallback too early.
- Lesson: For Habitschool’s launcher, keep the primary entry on the TWA path. If cold-start timing is slow, adjust the timeout budget and make launcher fallback manual inside the native loading UI instead of automatically replacing the shell with a normal browser tab.

### 175. Android TWA verification must include post-launch ANR/timeout observation, not just the first resumed activity
- Symptom: I reported the launcher fix as good after seeing `CustomTabActivity` become top resumed, but the user still hit `Chrome isn't responding` shortly afterward.
- Root cause: my verification window ended too early. A TWA flow can look correct for the first few seconds and still fail later when timeout policy or Chrome process state kicks in.
- Lesson: For Habitschool’s Android shell, do not stop at “TWA opened.” Force-stop app + Chrome, cold-start the launcher, then watch at least 25-30 seconds and inspect logcat for `TWA launch timed out`, `Opened browser surface`, `ANR`, or `Input dispatching timed out` before declaring the launcher stable.

### 176. Primary Android launcher startup must not block on Health Connect IPC
- Symptom: the installed Android app could stay on the branded loading screen and even hit an ANR before any web surface appeared.
- Root cause: `HabitschoolLauncherActivity` synchronously called `HealthConnectManager.hasRequiredPermissions()` via `runBlocking` on the main thread during cold start, putting Health Connect binder latency directly on the launcher critical path.
- Lesson: On cold start, the primary launcher may reuse only cheap cached Health Connect snapshot data. Do not synchronously query Health Connect permissions or records before handing off to the web surface.

### 177. If TWA handoff stalls, the launcher must auto-open an in-app fallback instead of waiting on the loading screen
- Symptom: even after removing some browser-loop issues, the Android launcher could still leave the user parked on the branded loading UI when trusted-surface handoff did not complete promptly.
- Root cause: the launcher depended on manual escape hatches or external browser fallback instead of opening a guaranteed in-app surface.
- Lesson: For Habitschool’s primary Android launcher, if trusted-surface launch stalls or throws, automatically open an in-app WebView fallback. Do not leave the user trapped on the native loading screen waiting for manual recovery.

### 178. Gallery first paint must never wait on secondary social data
- Symptom: after first login or immediately after an upload, the gallery tab could show hero UI plus endless skeleton cards until the user refreshed, and sometimes the next retry still waited behind the same stuck state.
- Root cause: `_loadGalleryDataInner()` started friendship loading in parallel but still awaited it before the first feed render. At the same time, the gallery loader had no stale in-flight reset, so a wedged `_galleryLoadingPromise` could block later reload attempts too.
- Lesson: For gallery/feed surfaces, treat friendship and similar social enrichments as optional follow-up data. Render the feed from cached/fetched logs first, rerender when enrichment arrives, and give the load gate its own stale-timeout recovery so one hung request cannot poison the next reload.
# 2026-04-11 (Mainnet Migration Economics)

### 60. Mainnet migration must preserve the live source-chain economics instead of resetting to constructor defaults
- Symptom: it is easy to assume a fresh mainnet deployment can start from the constructor default rate (`1P = 1 HBT`) and then migrate balances afterward.
- Root cause: deploy-time defaults and migration-time economics are different concerns. Users already earned balances under the live source-chain rate and policy, so resetting the destination chain changes effective value.
- Lesson: when planning a chain cutover, snapshot the live source-chain rate/policy first and preserve that economics during migration. Do not design migration math around fresh deploy defaults if users have already accrued balances under another live rate.

### 61. Mainnet cutover copy must follow the active chain config and onchain rate, not stale defaults
- Symptom: wallet and tokenomics surfaces can keep showing strings like `BSC ?뚯뒪?몃꽬`, `1:1`, or `100P = 100 HBT` even after the live addresses and `currentRate` changed.
- Root cause: default UI placeholders and docs were written for an earlier rollout stage and were not tied back to the active chain config or live onchain stats.
- Lesson: during chain cutover work, make wallet copy, explorer links, network badges, and tokenomics notes derive from the active chain config and current onchain rate where possible. Avoid hardcoding launch-era or testnet-era values into wallet defaults.

- 2026-04-18: 일부 사용자만 "화면은 보이는데 버튼/알림 탭이 전부 무반응"이면 브라우저 탓부터 하지 말고 자산 버전 정합성을 먼저 확인한다. 엔트리 스크립트만 `?v=`를 붙이고 내부 로컬 module import는 queryless로 두면, 배포가 누적될수록 특정 사용자 브라우저가 오래된 helper와 최신 entrypoint를 섞어 받아 `app.js` 전체가 import 단계에서 죽을 수 있다.
- 2026-04-18: PWA/service worker 앱에서 알림 클릭은 `navigate().focus()`만 믿지 않는다. 브라우저별 실패나 reject가 있어도 `clients.openWindow(destination)` fallback이 반드시 있어야 "알림 눌렀는데 아무 반응 없음"을 막을 수 있다.
- 2026-04-20: 사용자가 배포 전략만 접으려는 경우에는 관련 기능 코드를 바로 삭제하지 않는다. 특히 Play/APK/Health Connect처럼 정책이나 채널 때문에 잠시 비활성화하는 기능은 `feature flag`나 호스팅 차단으로 사용자 노출만 접고, 전략이 바뀌면 되살릴 수 있게 dormant 상태로 남긴다.
- 2026-04-20: 챌린지 정산은 `completedDays` 숫자만 믿고 끝내면 안 된다. 실패/성공 판정 직전에는 항상 `completedDates`를 dedupe해서 `completedDays`와 reconcile하고, `today === endDate`인 마지막 날은 오늘 기록을 먼저 반영한 뒤 정산해야 "화면상 100%인데 실패 정산" 같은 엇갈림을 막을 수 있다.
- 2026-04-20: 사용자가 옵션 이름/순서/동의 조건을 구체적으로 교정한 기획은 구현 전에 설정값으로 먼저 굳힌다. 특히 선택형 기능은 카탈로그 순서, 내부 `methodId`, 알림 기본값, 예외 동작을 코드 상수와 테스트에 함께 박아 두어야 뒤늦은 재해석을 막을 수 있다.
- 2026-04-20: 전역 `let` 상태를 참조하는 UI refresh 훅은 해당 상태 선언보다 앞에서 실행되면 TDZ 런타임 크래시가 난다. 초기화 순서가 있는 전역 상태(`_stepData` 같은 값)는 파일 상단 공용 영역에 먼저 선언하고, `window.* = async function` 형태로 바인딩되는 함수는 같은 파일 안에서도 직접 이름으로 호출하지 말고 `window.fn?.()`로만 호출해 초기화 순서 회귀를 막는다.
- 2026-04-20: 거대한 브라우저 모듈에서는 일부 전역 상태를 앞당기는 것만으로 초기화 순서 회귀가 끝나지 않을 수 있다. 특히 `auth.js` 같은 외부 모듈이 평가 도중 `openTab()`이나 `window.applyDietProgramUserData()`를 먼저 호출할 수 있으면, 늦게 선언된 다른 `let/const` 상태(`_dashboardCache`, `galleryUserFilter` 등)가 연쇄 TDZ를 낸다. 이런 경우에는 부팅 큐(`_appBootReady`)를 두고 조기 호출을 모듈 평가 완료 후로 미뤄야 한다.
- 2026-04-20: 사용자가 "인라인 렌더링하기에 너무 큽니다"를 실제 문제로 보정하면 단순히 무시 가능한 뷰어 제한으로 넘기지 않는다. 진입 파일(`styles.css`, `js/app.js`, `functions/index.js`)은 얇게 유지하고, 코어 구현을 분리했다면 service worker 캐시와 소스 검사 테스트도 새 위임 구조를 따라가게 함께 고친다.
- 2026-04-21: 신규가입 일회성 보상은 `sessionStorage` 임시 플래그나 `result.additionalUserInfo` 같은 취약한 클라이언트 힌트 하나에만 기대지 않는다. 가입 판정은 Firestore의 최초 사용자 문서 생성 여부 같은 영속 상태로도 보강하고, 이미 `onboardingComplete`만 찍히고 보상이 비어 있는 최근 가입자는 다음 로그인 때 자동 복구 경로를 둬야 대량 누락을 막을 수 있다.
- 2026-04-21: 호흡/명상 UI의 단계 표현은 렌더 시 문자열 추론으로 맞추지 않는다. `들이쉼/멈춤/내쉼`, 단계 초, 시각 상태(`inhale/hold/exhale`) 같은 표시는 `js/meditation-guide.js` 메타데이터에 함께 정의하고, UI와 사운드는 그 구조를 그대로 읽게 해야 후속 카피 수정과 애니메이션 변경이 함께 맞물린다.
- 2026-04-21: 초 단위로 진행되는 애니메이션 UI는 `setInterval` 렌더마다 DOM을 통째로 다시 그리면 안 된다. 호흡 단계 같은 진행 UI는 단계 구조가 바뀔 때만 마크업을 만들고, 매초 렌더에서는 활성 상태만 갱신해야 `4초 들이쉼/6초 내쉼`처럼 긴 애니메이션이 매초 리셋되지 않는다.
- 2026-04-21: DOM 재사용만으로는 실제 시간 기반 호흡 애니메이션이 충분하지 않을 수 있다. `들이쉼/내쉼`처럼 단계 길이가 중요한 UI는 키프레임 모양으로 흉내내지 말고, 현재 단계 진행률을 계산해 `fill` 값을 직접 갱신하고 그 사이만 CSS transition으로 보간해야 사용자 체감이 단계 초와 맞는다.
- 2026-04-21: 같은 `멈춤`이라도 의미가 다르면 시각 상태를 나눠야 한다. 4-7-8의 멈춤, 박스호흡의 꽉 찬 멈춤/다 빠진 멈춤처럼 UX 차이가 있는 경우에는 라벨 하나로 뭉개지 말고 `hold-full`, `hold-empty` 같은 별도 메타 값으로 분기해 렌더링과 사운드가 정확히 따라가게 한다.
- 2026-04-21: 명상 보조 영상처럼 사용자 선택이 있는 임베드는 정적 `iframe` 하나로 끝내지 않는다. 선택칩, 현재 선택 링크, autoplay URL, fullscreen 종료 복구까지 한 세트로 묶고, 마음챙김이 아닐 때는 autoplay를 꺼서 다른 명상 흐름에 영상 상태가 새지 않게 해야 한다.
- 2026-04-21: 사용자에게 여러 영상 선택지를 준다면 재생목록 하나의 `index`만 바꾸는 방식으로 때우지 않는다. 브라우저/임베드 캐시에 따라 같은 영상처럼 보일 수 있으니, 선택지마다 서로 다른 고정 `videoId`를 두고 기본 iframe src와 열기 링크도 같은 소스를 가리키게 맞춘다.
- 2026-04-21: 영상 선택칩은 기술적으로만 서로 다른 소스를 연결해 두지 말고, 실제 영상 분위기와 사용자 노출 이름이 맞는지 마지막에 한 번 더 대조한다. 특히 명상/휴식 콘텐츠는 라벨이 분위기를 설명하는 역할을 하므로 소스 교체 뒤에는 칩 이름도 같이 재점검해야 한다.
- 2026-04-21: 카드 안 보조 미디어는 이미 본문 카드가 충분히 크면 별도 헤더 박스를 또 씌우지 않는다. 마음챙김처럼 카드 하나 안에서 끝나는 경험은 선택칩과 플레이어만 남기고, 중복 제목/외부 링크는 기본에서 빼서 흐름을 단순하게 유지한다.
- 2026-04-21: `hidden` 속성으로 토글하는 UI에 클래스 `display: grid/flex/block`를 주면 author CSS가 `hidden`을 덮을 수 있다. 마음챙김 영상처럼 조건부 섹션은 `[hidden] { display:none !important; }`를 같이 두거나 inline style로 제어해서 "조건은 맞는데 계속 보이는" 회귀를 막는다.
- 2026-04-21: CSS transition이 걸린 fill UI는 새 단계 시작값을 그대로 `setProperty`하면 이전 상태에서 새 시작값까지도 애니메이션돼 보일 수 있다. 호흡 단계처럼 `들이쉼/내쉼` 시작 모양이 중요한 UI는 단계 시작 시 transition을 잠깐 `0s`로 끄고 시작 fill을 먼저 적용한 뒤, 다음 프레임에만 실제 목표 fill로 보간해야 역방향 튐을 막을 수 있다.
- 2026-04-21: YouTube 임베드는 iframe만 허용해도 콘솔이 조용해지지 않을 수 있다. 플레이어/미리보기 이미지가 `i.ytimg.com`에서 내려오므로, 영상 UI를 넣을 때는 `frame-src`뿐 아니라 `img-src`에 `https://*.ytimg.com`까지 함께 넣어 CSP 잡음을 막는다.
- 2026-04-23: 한국 규제 리스크가 있는 보상 설계는 온체인 토큰과 기프티콘 교환을 초기에 바로 결합하지 않는다. 사용자가 포인트 기반 교환으로 방향을 교정하면 보상몰 결제 자산을 오프체인 포인트로 먼저 분리하고, 온체인 HBT는 별도 자산 흐름으로 유지하는 구조를 우선 적용한다.
- 2026-04-26: 사용자가 보상 교환 비율을 다시 교정하면 현재 출시 상품 가격만 바꾸고 끝내지 않는다. `pointCost`, seed JSON, env 안내문, 테스트 기대값, 미래 후보 상품의 placeholder 가격까지 같은 경제 정책 축에서 함께 갱신해야 다음 승인/배포 단계에서 숫자가 엇갈리지 않는다.
- 2026-04-27: 이 워크스페이스에서 사용자가 `스테이징`이라고만 말하면 추가 확인 질문으로 멈추지 말고, 현재 `main`을 기준으로 스테이징 푸시와 Firebase staging 배포까지 한 번에 진행한다. 별도 확인은 사용자가 배포를 보류하거나 범위를 제한할 때만 한다.
- 2026-04-27: 보상몰에서 `최소 교환 포인트`와 `일/주/월 교환 한도`는 절대 같은 fallback 축으로 묶지 않는다. 최소값을 500P로 낮출 때 한도도 함께 500P로 붕괴하면 2000P 상품이 전부 막히므로, 한도는 별도 launch default와 env 값을 기준으로 계산하고 테스트로 분리해 둔다.
- 2026-04-27: 사용자가 브랜드/상품 이미지를 "실제 원본으로" 교정하면 생성 SVG나 임의 일러스트로 타협하지 않는다. 제공사 상품 이미지나 공식 사이트 로고처럼 출처가 분명한 자산으로 바로 교체하고, 원격 자산을 쓰면 CSP 허용 도메인과 seed 데이터까지 함께 맞춘다.
- 2026-04-27: 사용자가 여러 공식 자산 중 특정 로고 파일을 직접 골라주면, 이전에 고른 "공식 로고 후보"를 유지하지 말고 그 정확한 파일을 앱 자산으로 반영한다. 특히 브랜드 마크는 URL 출처보다 사용자가 승인한 시각 버전을 우선한다.
- 2026-04-27: 보상몰처럼 모바일 밀도가 높은 화면은 마케팅성 가이드 문구를 계속 쌓지 않는다. 사용자가 "줄이고 한 줄로" 교정하면 상단 카피, 가격 정보, 보관함 안내를 핵심 상태만 남기는 방향으로 압축하고, 클릭 가능한 바코드/삭제 같은 실제 행동을 먼저 드러낸다.
- 2026-04-27: mock 쿠폰 만료일을 고정 30일로 두지 않는다. 현재 판매 중인 상품이 60일 등 다른 유효기간이면 카탈로그/상품 메타데이터에서 만료일을 계산해 mock, provider 응답 fallback, 화면 표기가 모두 같은 기준을 쓰게 한다.
- 2026-04-27: 쿠폰 보관함처럼 실제 사용 맥락이 강한 화면은 상품 식별 정보와 사용 행동을 분리하지 않는다. 사용자가 바코드만 보고 헷갈리면 상품 이미지도 함께 두고, mock 쿠폰은 `테스트` 표식과 `사용 완료` 같은 정리 액션을 바로 노출해 실쿠폰과 구분되게 한다.
- 2026-04-27: 관제탑 운영 버튼 이름은 내부 구현이 아니라 실제 운영 행동을 그대로 써야 한다. 공급사 재조회인데 `보관함 재확인`처럼 사용자 화면 기준으로 부르면 운영자가 오해하므로, admin 액션은 `쿠폰 재조회`, `공급사 재확인`처럼 외부 처리 의미가 드러나게 맞춘다.
- 2026-04-27: 관리자 도구에서는 자유 입력 사유 prompt를 기본으로 붙이지 않는다. 실제 분기 로직 없이 로그용 문자열만 남기는 경우에는 고정 reason key를 코드에서 넘기고, 운영자는 즉시 실행 가능한 버튼만 보게 해야 흐름이 덜 끊기고 실수도 줄어든다.
- 2026-04-27: 저장 후 거의 바뀌지 않는 사용자 정보는 입력창을 계속 펼쳐 두지 않는다. 연락처처럼 재사용되는 값은 기본을 접힌 보기 모드로 두고, 마스킹된 값과 `수정` 버튼만 보여줘야 모바일 화면 밀도가 유지된다.
- 2026-04-27: 모바일 쿠폰 보관함에서는 상품 이미지를 주인공처럼 크게 두지 않는다. 상품 썸네일은 바코드/PIN보다 한 단계 낮은 보조 식별 요소로 작게 제한하고, 바코드 확대는 카드형 팝업보다 넓은 가로형 전체화면으로 보여줘야 실제 스캔 맥락에 맞다.
- 2026-04-27: 모바일 스캔 UX에서 "가로모드로 보여달라"는 요청은 단순히 넓은 카드가 아니라 회전된 랜드스케이프 표현을 뜻할 수 있다. 바코드 확대는 필요한 경우 90도 회전한 가로형 프레임으로 보여주고, 상품 이미지는 줄이더라도 해빛 마켓 카드와 위계가 어긋나지 않게 같은 기준 크기를 유지한다.
