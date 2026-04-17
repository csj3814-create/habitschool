# 2026-04-17 APK 설치 링크 안정화

> **상태**: 진행 중

## 작업
- [x] staging 설치 링크 404 원인 확인
- [x] APK를 고정 서빙 경로로 준비하는 스크립트 추가
- [x] Firebase hosting 설정을 고정 APK 파일 기준으로 정리
- [x] staging/prod 배포 단계에 APK 자동 준비 반영
- [ ] staging 링크 복구 확인

## 원인

- `/install/android.apk`가 실제 파일이 아니라 `android/app/build/outputs/apk/debug/app-debug.apk`로 302 redirect 되도록 되어 있었다.
- 임시 worktree에서 웹만 배포하면 Android build output이 비어 있어서 redirect 대상이 404가 되었다.
- 즉 링크가 바뀐 것이 아니라, 배포 구조가 build artifact 존재를 전제로 해서 깨진 상태였다.

## 목표

- 사용자는 항상 `/install/android.apk` 같은 고정 링크만 쓰면 된다.
- 배포 시점에 APK를 고정 경로로 준비해 두어 redirect 대상 부재로 404가 나지 않게 한다.
- Android를 다시 빌드하지 않은 웹 배포에서도 최소한 링크가 깨지지 않도록 한다.

## 결과

- `scripts/prepare-hosted-apk.js`를 추가해 deploy 전에 `install/android.apk`, `install/android-debug.apk`를 자동 준비하도록 했다.
- Firebase Hosting은 더 이상 build output 경로로 redirect 하지 않고, 고정 파일 경로를 그대로 서빙하도록 정리했다.
- `firebase.json` hosting `predeploy`에 APK 준비 스크립트를 연결해 `firebase deploy ... --only hosting` 계열 명령에서도 자동으로 APK가 준비되게 했다.
- build output이 없는 상황도 재현해서, predeploy 스크립트가 `:app:assembleDebug`로 APK를 다시 만들고 `install/` 아래에 복사하는 것까지 확인했다.

## 검증

- `node scripts/prepare-hosted-apk.js`
- build output 삭제 상황 재현 후 `node scripts/prepare-hosted-apk.js`
- `npm test` (`171 passed`)
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
- `node --check scripts/prepare-hosted-apk.js`

## 리뷰

- 이번 문제의 핵심은 링크 주소가 아니라, hosting이 임시 Android build artifact 경로를 직접 가리키고 있었다는 배포 구조였다.
- 이제는 install 링크가 고정 파일 경로를 가리키고, deploy 시점에 그 파일을 보장하도록 바뀌어서 web-only deploy에서도 404가 나지 않는 구조가 됐다.
