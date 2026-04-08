# 2026-04-08 Android 하이브리드 셸 1차
> **상태**: 1차 스캐폴드 완료

## 목표

- [x] 기존 PWA/배포 구조를 기준으로 Android 확장 진입점 검토
- [x] Android 기본 방향을 `TWA 중심 + 네이티브 확장` 하이브리드 셸로 결정
- [x] Android 앱 모듈 스캐폴드 추가
- [x] TWA 런처와 앱 링크 기본 경로 연결
- [x] Health Connect 읽기 전용 PoC 추가
- [x] 홈 위젯 MVP 추가
- [x] 퀵패널 타일 MVP 추가
- [x] 아키텍처/설정/다음 단계 문서화
- [x] 검증 커맨드 실행 및 결과 기록

## 결정

- 순수 TWA만으로는 Health Connect, App Widget, Quick Settings Tile을 구현할 수 없으므로 기본 컨테이너는 TWA로 두고 네이티브 기능만 얇게 추가한다.
- 기존 PWA의 진입 규약은 최대한 재사용한다.
  - 메인 진입: `https://habitschool.web.app/`
  - 탭 딥링크: `/?tab=exercise`, `/?tab=diet&focus=upload`, `/?tab=profile&panel=invite`
  - Digital Asset Links: 현재 `.well-known/assetlinks.json`의 `com.habitschool.app`를 기준으로 유지
- Health Connect PoC는 우선 읽기 전용으로 제한한다.
  - 범위: 오늘 걸음 수 조회
  - 저장: Android 로컬 캐시
  - 노출: 위젯/타일/앱 내 네이티브 상태
  - 제외: Firestore 직접 쓰기, 웹 세션 브리지, 자동 백그라운드 업로드

## 작업 계획

- [x] 웹/PWA 기준 진입점, 설치 흐름, share target, assetlinks 상태 점검
- [x] `android/` Gradle 프로젝트 추가
- [x] `LauncherActivity`에서 TWA 실행
- [x] `HealthConnectManager`와 권한/조회 흐름 추가
- [x] `SharedPreferences` 기반 캐시 추가
- [x] 위젯 Provider / 레이아웃 추가
- [x] 퀵패널 TileService 추가
- [x] Android README 및 다음 통합 포인트 문서화

## 검증 예정

- `npm test`
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
- `cd android && .\gradlew.bat help`
- `cd android && .\gradlew.bat :app:assembleDebug`

## 리뷰

- `android/` 하위에 독립 Gradle 프로젝트를 추가했고, 기본 셸은 `HabitschoolLauncherActivity` 기반 TWA로 구성했다.
- Health Connect PoC는 `READ_STEPS`만 요청하고 오늘 걸음 수 aggregate 결과를 로컬 캐시에 저장하도록 제한했다.
- 위젯과 퀵패널 타일은 같은 로컬 캐시를 읽도록 묶어서 1차 UX를 최소 구현했다.
- 첫 `assembleDebug` 시점에 `androidx.health.connect:connect-client:1.1.0`와 `androidx.browser` 계열이 `compileSdk 36`을 요구하는 것을 확인했고, `compileSdk`를 36으로 올린 뒤 빌드가 통과했다.
- 이 머신에서는 `android/local.properties`를 로컬 전용으로 추가해 SDK 경로를 연결했다. `android/.gitignore`로 커밋 대상에서는 제외했다.

## 검증 결과

- `npm test` 통과 (`117 passed`)
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js` 통과
- `cd android && .\gradlew.bat help` 통과
- `cd android && .\gradlew.bat :app:assembleDebug` 통과

## 다음 단계

- 실기기에서 TWA 풀스크린 검증
- Health Connect 권한 승인 후 오늘 걸음 수가 위젯/타일에 반영되는지 확인
- 웹 `exercise` 탭과 네이티브 걸음 수 UX 통합 방식 결정
- 필요 시 Firestore 업로드 대신 브리지/명시적 동기화 UX 설계
