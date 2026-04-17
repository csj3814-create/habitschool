# 2026-04-17 Chrome ANR after TWA launch

> **상태**: 진행 중

## 작업
- [x] 에뮬레이터에서 Chrome ANR 재현
- [x] logcat / activity dump로 ANR 원인 수집
- [x] launcher/TWA 경로 문제인지 Chrome 상태 문제인지 분리
- [x] 필요 시 근본 수정
- [x] 테스트/빌드/에뮬레이터 재검증

## 메모

- 사용자 보고: 앱은 열리지만 에뮬레이터에 `Chrome isn't responding`가 뜬다.
- 이전 확인에서는 `CustomTabActivity` top resume까지만 보고 종료했기 때문에, ANR dialog까지 포함한 full cold-start 검증이 부족했을 수 있다.

## 결과

- 이전 빌드에서는 실제로 launcher 이후 `Chrome isn't responding` 수준의 비정상 상태가 재현됐다.
- 직접 원인은 launcher 자체보다 `TWA launch timeout` 정책이었다. warmup 시간을 포함한 짧은 timeout이 지나면 launcher가 외부 브라우저 fallback을 자동으로 열었고, 그 과정에서 Chrome/TWA 태스크가 비정상적으로 꼬였다.
- 현재 코드는 launcher entry에서 timeout이 나더라도 자동 브라우저 전환을 하지 않고 native loading UI에 수동 버튼만 노출한다.
- cold start 검증에서 최종 `topResumedActivity=...CustomTabActivity`가 유지됐고, 최신 로그에서는 `TWA launch timed out` / `Opened browser surface`가 더 이상 발생하지 않았다.

## 검증

- `npm test` (`171 passed`)
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
- `cd android && .\\gradlew.bat :app:assembleDebug :app:installDebug`
- emulator cold start:
  - `adb shell am force-stop com.habitschool.app`
  - `adb shell am force-stop com.android.chrome`
  - `adb shell am start -W -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -n com.habitschool.app/.HabitschoolLauncherActivity`
  - 35초 관찰로 과거 ANR 재현
  - 수정 후 26초 관찰에서 `topResumedActivity=...CustomTabActivity`, `TWA launch timed out` 미발생 확인

## 리뷰

- 이번 이슈는 "launcher가 열렸다"와 "Chrome/TWA가 안정적으로 takeover했다"를 같은 것으로 보면 놓치기 쉬운 종류였다.
- 앞으로 Android shell 검증은 최소 25~30초 관찰과 ANR/timeout 로그 확인까지 포함해야 한다.
