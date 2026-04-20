## Play Console Step 3 - Private Test Upload Checklist

- [ ] 비공개 테스트(Alpha/Closed testing)에 `app-release.aab` 업로드
- [ ] App access 리뷰용 계정/접속 방법 준비
- [ ] App content 필수 항목(Health apps declaration, Data safety, Ads, App access 등) 완료
- [ ] 비공개 테스트 테스터 그룹/이메일 리스트 설정
- [ ] opt-in 링크 발급 후 테스터에게 배포

### Release artifact

- Upload file:
  - [android/app/build/outputs/bundle/release/app-release.aab](/C:/SJ/antigravity/habitschool/android/app/build/outputs/bundle/release/app-release.aab)
- Optional install check:
  - [android/app/build/outputs/apk/release/app-release.apk](/C:/SJ/antigravity/habitschool/android/app/build/outputs/apk/release/app-release.apk)

### What is ready from the repo

- Package name: `com.habitschool.app`
- Release SHA-256: `C6:BE:28:7B:3E:90:32:5B:94:44:41:C5:15:D6:9E:5E:59:B1:05:89:12:3F:5B:C1:35:7E:37:15:69:E8:E8:24`
- Matching asset links:
  - [.well-known/assetlinks.json](/C:/SJ/antigravity/habitschool/.well-known/assetlinks.json:1)
- Privacy policy URL:
  - [https://habitschool.web.app/privacy.html](https://habitschool.web.app/privacy.html)
- Support contact seen in repo privacy policy:
  - `habitschool0@gmail.com`

### Play Console decisions to use

- Track: use the existing closed testing track (`Alpha`) for the required private test.
- Do not rely on internal testing for the 12 testers / 14 days requirement.
- Be careful not to move required closed-test users onto internal testing first, because internal testers must opt out before they can receive closed/open builds.

### App content checklist

- Health apps declaration:
  - Required because the app includes health / fitness / sleep features and accesses Health Connect step data.
  - Recommended categories for this app:
    - `Activity and Fitness`
    - `Nutrition and Weight Management`
    - `Sleep Management`
    - `Stress Management, Relaxation, Mental Acuity`
  - Relevant Android permission:
    - [android/app/src/main/AndroidManifest.xml](/C:/SJ/antigravity/habitschool/android/app/src/main/AndroidManifest.xml:1)
  - Relevant native flow:
    - [android/app/src/main/java/com/habitschool/app/HealthConnectPermissionActivity.kt](/C:/SJ/antigravity/habitschool/android/app/src/main/java/com/habitschool/app/HealthConnectPermissionActivity.kt:1)
- Privacy policy:
  - Required in Play Console and already available in-app / on web.
- Data safety:
  - Closed testing still needs this. Internal testing alone would be exempt, but this app is preparing for closed testing.
- App access:
  - The app requires login for meaningful review, so reviewer access details are needed.
- Ads:
  - If the app has no ad SDK / ad surfaces, answer `No ads`.

### Store listing draft

- App name:
  - `해빛스쿨 습관학교 - 즐겁게 좋은 습관 만들기`
- Category:
  - `Health & Fitness`
- Short description draft:
  - `식단, 운동, 수면과 마음 기록을 한곳에서 이어가는 건강 습관 앱`
- Full description draft:
  - `해빛스쿨은 식단, 운동, 수면, 마음 기록을 한곳에서 이어가며 좋은 습관을 꾸준히 만들 수 있도록 돕는 건강 습관 앱입니다.`
  - `식단 사진 기록, 운동 기록, 수면 캡처 분석, 감사/마음 기록을 통해 하루의 생활 패턴을 정리하고 주간 흐름을 확인할 수 있습니다.`
  - `Android 앱에서는 Health Connect와 연동해 오늘의 걸음수를 가져와 운동 기록에 반영할 수 있습니다.`
  - `기록, 포인트, 커뮤니티 피드를 함께 제공해 작은 실천을 꾸준한 루틴으로 이어갈 수 있도록 설계했습니다.`
  - `해빛스쿨은 의료 진단이나 치료를 제공하지 않으며, 건강 습관 관리와 자기 기록을 돕는 서비스입니다.`

### Data safety draft notes

- This is a draft checklist, not a final legal declaration. Confirm against actual production behavior before submitting.
- Likely user data categories to review:
  - Personal info: Google account email, display name, profile photo
  - Health and fitness: diet logs, exercise logs, sleep screenshots / sleep-related records, body metrics, step count
  - Photos and videos: uploaded meal / exercise / sleep images and exercise videos
  - App activity / diagnostics: usage logs, analytics, crash or operational logs
- Likely processors/services disclosed in repo privacy policy:
  - Firebase
  - Google Cloud / Gemini-backed analysis flow

### Reviewer access checklist

- Prepare one reusable reviewer account.
- If using Google sign-in, provide:
  - Google account email
  - password
  - exact sign-in steps in English
  - any notes needed to bypass OTP / 2FA / region restrictions
- Make sure the account can access all core tabs and reviewable functionality.

### Suggested reviewer instructions

1. Install the app from the closed-testing opt-in link.
2. Open the app and sign in with the provided Google account.
3. Review the core tabs: Diet, Exercise, Mind, Dashboard, Assets, Gallery.
4. For Health Connect review, use the Android shell and open Exercise > `Health Connect에서 가져오기`.
5. If any content is account-gated, the provided account should already be fully usable without extra approval.

### Remaining external blockers

- A dedicated reviewer Google account has not been created/documented in the repo.
- Play Console form inputs still need to be entered manually.
- Store listing screenshots / short description / full description still need a final owner review before submission.

### Review

- Prepared a repo-grounded checklist so Play Console private-test upload can proceed without guessing which artifact, policy fields, or health declaration inputs are needed.
- The first private-test upload attempt was blocked because Play Console had already seen `versionCode = 1`. The Android shell now uses `versionCode = 2` and `versionName = 0.1.1` in [android/app/build.gradle.kts](/C:/SJ/antigravity/habitschool/android/app/build.gradle.kts:1), and a fresh release bundle was rebuilt for re-upload.
