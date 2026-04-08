# Habitschool Android Shell

해빛스쿨 Android 확장 1차 스캐폴드입니다.

## 방향

- 기본 런타임: `Trusted Web Activity`
- 네이티브 확장: `Health Connect`, `App Widget`, `Quick Settings Tile`
- 원칙: 기존 웹/PWA 흐름을 그대로 살리고, Android에서만 가능한 기능만 얇게 추가

## 왜 하이브리드인가

순수 TWA만으로는 아래 기능을 직접 구현할 수 없습니다.

- Health Connect 읽기
- 홈 위젯
- 퀵패널 타일

그래서 앱 본체는 TWA로 웹앱을 열고, 네이티브 셸은 Android 전용 기능만 담당하도록 분리했습니다.

## 포함된 구성

- `HabitschoolLauncherActivity`
  - `https://habitschool.web.app/`를 여는 TWA 런처
  - 앱 링크 호스트는 `habitschool.web.app`
- `HealthConnectPermissionActivity`
  - `READ_STEPS` 권한 요청
  - 오늘 걸음 수 aggregate read
  - 로컬 캐시 저장
- `OnboardingActivity`
  - Health Connect 앱에서 해빛스쿨 연결을 시작할 때 쓰는 안내 화면
- `PermissionsRationaleActivity`
  - Health Connect 권한 사유/개인정보 안내 화면
- `HabitschoolWidgetProvider`
  - 오늘 걸음 수 / 연결 상태 / 동기화 / 웹 열기
- `HabitschoolTileService`
  - 퀵패널에서 오늘 걸음 수 상태 표시
  - 클릭 시 동기화 후 운동 탭으로 진입

## 현재 PoC 범위

- Health Connect는 읽기 전용입니다.
- 읽는 데이터는 `오늘 걸음 수` 하나입니다.
- 결과는 Android 로컬 캐시에만 저장합니다.
- 웹앱 Firestore 직접 쓰기나 자동 업로드는 아직 하지 않습니다.

## 로컬 저장

- `SharedPreferences`
- 키: `habitschool_native_summary`
- 저장 내용:
  - 마지막 동기화 걸음 수
  - 마지막 동기화 시각
  - Health Connect 가용성
  - 권한 부여 여부

## 웹 연동 규약

- 홈: `https://habitschool.web.app/`
- 운동 탭: `https://habitschool.web.app/?tab=exercise`
- 대시보드 탭: `https://habitschool.web.app/?tab=dashboard`
- 개인정보처리방침: `https://habitschool.web.app/privacy.html`

`native=...` 쿼리는 Android 진입 출처를 구분하기 위한 예약 필드로 넣어 두었습니다.

## Asset Links

레포 루트의 `.well-known/assetlinks.json`에 이미 아래 패키지가 선언되어 있습니다.

- `com.habitschool.app`

따라서 Android 서명 키가 현재 fingerprint와 맞으면 TWA 풀스크린 검증에 바로 사용할 수 있습니다.

## 열기

```powershell
cd android
.\gradlew.bat tasks
```

Android SDK가 잡혀 있다면 Android Studio에서 `android/` 디렉터리를 그대로 열면 됩니다.

## 아직 남은 일

1. Android SDK 경로를 맞추고 실제 Gradle sync/build 통과 확인
2. 실제 서명 키 기준 fingerprint 재검증
3. Widget/Tile 디자인 다듬기
4. 웹앱 운동 탭과 네이티브 걸음 수를 어떤 UX로 합칠지 결정
5. Health Connect 값을 Firestore로 올릴지, 웹에 브리지로 전달할지 아키텍처 확정

## 권장 다음 단계

1. Android Studio에서 `android/`를 열고 SDK sync 통과
2. 실기기에서 TWA 풀스크린 검증
3. Health Connect 권한 허용 후 오늘 걸음 수가 위젯/타일에 반영되는지 확인
4. 그 다음 턴에서 웹 `exercise` 탭과 네이티브 걸음 수 표시를 연결
