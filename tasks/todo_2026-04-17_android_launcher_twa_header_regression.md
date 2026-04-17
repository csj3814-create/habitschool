# 2026-04-17 Android 런처 TWA 헤더 회귀 수정

> **상태**: 진행 중

## 작업
- [x] 상단이 두꺼운 Chrome 탭으로 열리는 원인 확인
- [x] 홈 아이콘/설치 후 열기 진입을 다시 TWA 경로로 복구
- [x] 흰 화면 회피용 warmup / fallback 흐름은 유지
- [x] 테스트, 빌드, 에뮬레이터 실행 검증
- [x] 결과 및 교훈 정리

## 원인

- `HabitschoolLauncherActivity`가 `ACTION_MAIN + CATEGORY_LAUNCHER`일 때 `openBrowserSurface(..., "main-launcher-browser")`로 직접 보내고 있었다.
- 이 경로는 TWA가 아니라 일반 Chrome 탭(`ChromeTabbedActivity`)을 열기 때문에 상단 바가 두껍고 주소창도 그대로 노출된다.
- 즉 현재 증상은 브라우저/UI 문제라기보다, 내가 이전 흰 화면 대응 과정에서 런처를 아예 일반 브라우저 경로로 바꿔버린 회귀였다.

## 결과

- 홈 아이콘/설치 후 열기 진입은 다시 TWA 우선 경로를 타도록 복구했다.
- `main-launcher-browser` 직접 분기를 제거해서 launcher가 일반 Chrome 탭으로 열리던 회귀를 없앴다.
- TWA timeout은 warmup 이전이 아니라 실제 `twaLauncher.launch(...)` 이후부터 카운트되도록 옮기고, 예산도 `20초`로 늘렸다.
- launcher timeout 시에는 자동으로 외부 브라우저를 열지 않고, native loading 화면 안에서 수동 `브라우저로 열기` 버튼만 보여주도록 바꿨다. 그래서 주소창이 자동으로 덮어쓰는 회귀를 막았다.

## 검증

- `npm test` (`171 passed`)
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
- `cd android && .\\gradlew.bat :app:assembleDebug :app:installDebug`
- Android emulator cold start 검증
  - `adb shell am force-stop com.habitschool.app`
  - `adb shell am force-stop com.android.chrome`
  - `adb shell am start -W -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -n com.habitschool.app/.HabitschoolLauncherActivity`
  - 26초 대기 후 `topResumedActivity=...CustomTabActivity` 확인
  - `HabitschoolLauncher` 로그에서 `Opened browser surface` / `TWA launch timed out` 미발생 확인

## 리뷰

- 초기 판단처럼 단순히 launcher를 TWA로 되돌리는 것만으로는 부족했다. 실제 원인은 `launcher를 일반 브라우저로 보내던 회귀`와 `TWA timeout이 warmup 시간까지 먹어 브라우저 fallback을 너무 일찍 여는 정책`이 함께 만든 문제였다.
- 최종적으로는 launcher를 다시 TWA 경로로 되돌리고, timeout이 나더라도 자동 브라우저 오픈 대신 수동 버튼만 노출하게 해서 “얇은 앱형 상단 바” 기대를 깨지 않도록 정리했다.
