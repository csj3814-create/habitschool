## Play Console Step 1 - Release Keystore

- [x] 기존 release keystore 후보와 assetlinks fingerprint 관계를 확인한다
- [x] gitignored 로컬 signing 설정에 keystore를 연결한다
- [x] release signing 상태와 fingerprint 매칭을 검증한다
- [x] 다음 단계(BuildRelease / Play 업로드) 진입 조건을 정리한다

## Play Console Step 2 - Signed Release Artifacts

- [x] `bundleRelease`와 `assembleRelease`를 실제 실행한다
- [x] 생성된 AAB/APK 파일 경로와 크기를 확인한다
- [x] release APK 서명이 expected fingerprint와 일치하는지 검증한다
- [x] Play Console에 업로드할 다음 액션을 정리한다

### Notes

- 목표는 `com.habitschool.app`의 기존 release fingerprint를 유지한 채 로컬에서 signed release build 준비를 복구하는 것이다.
- 비밀값은 gitignored 로컬 파일이나 외부 파일에만 두고, repo 추적 파일에는 절대 남기지 않는다.

### Review

- 기존 Google Play package 폴더 `C:\SJ\antigravity\해빛스쿨 - Google Play package`에서 `signing.keystore`와 `signing-key-info.txt`를 확인했고, 해당 SHA-256 fingerprint가 현재 `.well-known/assetlinks.json`의 release fingerprint `C6:BE:28:...:24`와 정확히 일치했다.
- repo 안에는 gitignored 경로만 사용하도록 `android/signing/habitschool-release.keystore`와 `android/release-signing.local.properties`를 준비했다. 비밀값은 추적 파일에 넣지 않았다.
- `release-signing.local.properties`를 처음 UTF-8 BOM으로 저장했을 때 Gradle `Properties.load()`가 첫 키를 읽지 못해 signing이 미설정처럼 보였고, ASCII로 다시 써서 해결했다.
- 검증 결과:
  - `cd android && .\gradlew.bat -q printReleaseSigningStatus`
  - `keytool -list -v -keystore android/signing/habitschool-release.keystore -alias my-key-alias ...`
  - `powershell -ExecutionPolicy Bypass -File .\android\scripts\Sync-AssetLinks.ps1 -Mode check`
  - `powershell -ExecutionPolicy Bypass -File .\android\scripts\Check-TwaReleaseReadiness.ps1`
- 현재 다음 단계는 `Check-TwaReleaseReadiness.ps1 -BuildRelease` 또는 `.\gradlew.bat :app:bundleRelease :app:assembleRelease`로 signed AAB/APK를 만드는 것이다.
- 첫 release build 시 `validateSigningRelease`가 `android/app/signing/...`를 찾다가 실패했다. 원인은 [android/app/build.gradle.kts](/C:/SJ/antigravity/habitschool/android/app/build.gradle.kts:1)의 `file(...)` 상대경로 해석이 예제/문서가 가정한 `android/` 루트 기준과 달랐기 때문이다.
- build script를 고쳐 상대 keystore 경로를 `rootProject.file(...)` 기준으로 해석하게 했고, 그 뒤 `.\gradlew.bat :app:bundleRelease :app:assembleRelease`가 성공했다.
- 생성된 산출물:
  - [android/app/build/outputs/bundle/release/app-release.aab](/C:/SJ/antigravity/habitschool/android/app/build/outputs/bundle/release/app-release.aab)
  - [android/app/build/outputs/apk/release/app-release.apk](/C:/SJ/antigravity/habitschool/android/app/build/outputs/apk/release/app-release.apk)
- release APK의 SHA-256 fingerprint도 `C6:BE:28:7B:...:24`로 확인되어 현재 release `assetlinks.json` fingerprint와 일치했다.
- 이번 단계 검증:
  - `cd android && .\gradlew.bat :app:bundleRelease :app:assembleRelease`
  - `keytool -printcert -jarfile android\app\build\outputs\apk\release\app-release.apk`
  - `npm test` -> `178 passed`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
- 다음 실제 Play Console 작업은 `app-release.aab`를 비공개 테스트 트랙에 업로드하고, 필요 메타데이터/선언 폼을 마저 채우는 것이다.
