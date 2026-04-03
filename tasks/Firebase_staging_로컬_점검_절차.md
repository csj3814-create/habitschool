# Firebase staging / 로컬 점검 절차

> 상태: 진행 중
> 작성일: 2026-04-03

## 목적

- 본서버(`prod`)에 올리기 전에 `localhost` 와 `staging` 에서 변경 사항을 먼저 확인한다.
- UI, Firestore rules, Functions, Storage, 관리자 화면, 공유 링크, 푸시 설정이 어느 환경을 보는지 명확히 구분한다.

## 현재 환경 분리 방식

- `prod`
  - Firebase 프로젝트: `habitschool-8497b`
  - 대표 URL: `https://habitschool.web.app`
- `staging`
  - Firebase 프로젝트: `habitschool-staging`
  - 대표 URL: `https://habitschool-staging.web.app`
- `localhost`
  - Firebase 프로젝트 설정은 `staging` 값을 재사용
  - Auth 는 우선 `staging Auth` 를 그대로 사용
  - Firestore / Functions / Storage 는 로컬 emulator 로 연결

## 점검 전에 알아둘 점

- 로컬에서는 Google 로그인 팝업이 계속 동작하도록 Auth emulator 를 강제로 붙이지 않았다.
- 대신 로그인 후 데이터 읽기/쓰기, callable 호출, 업로드는 emulator 로 가도록 분리했다.
- 로컬에서는 FCM 토큰 등록과 백그라운드 푸시는 건너뛴다.
- staging 에서는 FCM / 이메일 / 실제 서버 함수 흐름까지 실제와 가깝게 확인할 수 있다.

## 1. 로컬 emulator 점검

### 실행

```powershell
npm run emulators
```

또는 helper script 로 직접 실행:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-firebase-emulators.ps1
```

기존 emulator를 내리고 다시 올리려면:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-firebase-emulators.ps1 -Restart
```

현재 떠 있는 emulator만 정리하려면:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-firebase-emulators.ps1
```

### 실행 전 주의

- Firebase CLI `15.8.0` 기준으로 Firestore emulator는 Java 21 이상이 필요했다.
- Windows에서 `java` 경로가 바로 잡히지 않으면 아래처럼 Java 21 경로를 먼저 잡고 실행한다.

```powershell
$env:JAVA_HOME='C:\Program Files\Microsoft\jdk-21.0.10.7-hotspot'
$env:PATH="$env:JAVA_HOME\bin;$env:PATH"
firebase emulators:start --project staging --debug
```

### 접속 주소

- 앱: `http://127.0.0.1:5000`
- Emulator UI: `http://127.0.0.1:4000`

### 로컬에서 기대하는 동작

- Firebase config 는 `habitschool-staging` 기준으로 초기화된다.
- Firestore 는 `127.0.0.1:8080`
- Functions 는 `127.0.0.1:5001`
- Storage 는 `127.0.0.1:9199`
- Auth 는 staging Firebase Auth 를 사용한다.

### 로컬 smoke test

1. 앱을 열고 Google 로그인까지 되는지 확인
2. 오늘 식단/운동/수면 기록 저장
3. 이미지 업로드가 emulator Storage 로 가는지 확인
4. 대시보드 수치와 챌린지 카드가 정상 렌더되는지 확인
5. 추천 링크가 `localhost` 기준으로 생성되는지 확인
6. 관리자 페이지([admin.html](/C:/SJ/antigravity/habitschool/admin.html))가 emulator 데이터로 열리는지 확인
7. 커뮤니티 히스토리([community-history.html](/C:/SJ/antigravity/habitschool/community-history.html))가 같은 환경으로 붙는지 확인

### 2026-04-03 확인 결과

- Java 21 경로를 명시한 뒤 emulator 기동에 성공했다.
- `http://127.0.0.1:5000/` 응답 코드 `200` 확인
- `http://127.0.0.1:5000/admin.html` 응답 코드 `200` 확인
- `http://127.0.0.1:5000/community-history.html` 응답 코드 `200` 확인
- `http://127.0.0.1:4000/` 응답 코드 `200` 확인
- auth `9099`, functions `5001`, firestore `8080`, hosting `5000`, storage `9199` 포트가 모두 LISTEN 상태로 올라오는 것 확인
- callable 예시 URL `http://127.0.0.1:5001/habitschool-staging/asia-northeast3/getTokenStats` 에 POST 시 `400` 응답 확인
- storage root `http://127.0.0.1:9199/` 요청 시 `501` 응답 확인
- auth root `http://127.0.0.1:9099/` 요청 시 `200` 응답 확인

### 추가 메모

- Codex/터미널 실행 환경에서는 장시간 콘솔을 붙잡은 `firebase emulators:start` 가 타임아웃으로 끊기며 Firebase CLI 쪽에 `EPIPE` 가 날 수 있었다.
- 이 경우 emulator 일부만 남는 반쪽 기동이 생길 수 있으므로, 현재는 `scripts/start-firebase-emulators.ps1` 로 별도 프로세스에서 띄우는 방식을 우선 추천한다.
- 같은 포트에 이미 emulator가 떠 있으면 새 프로세스를 또 올리지 말고, 기존 실행 중인 `http://127.0.0.1:5000` 과 `http://127.0.0.1:4000` 을 그대로 사용하면 된다.
- `start-firebase-emulators.ps1` 는 기본적으로 기존 실행 중인 emulator를 감지하면 주소만 안내하고 종료한다. 강제로 재시작하려면 `-Restart` 옵션을 사용한다.
- Functions emulator 는 현재 전역 Node `24` 를 사용하고 있으며, `functions/package.json` 의 요청 버전 `22` 와 다르다는 경고가 뜬다. 이번 기동 자체는 성공했지만, 나중에 staging 검증 전에는 로컬 Node 버전도 맞춰 두는 편이 더 안전하다.

## 2. staging 배포 점검

### 전체 반영

```powershell
npm run deploy:staging
```

### Hosting 만 빠르게 확인

```powershell
npm run deploy:staging:hosting
```

### staging 에서 기대하는 동작

- 앱/관리자/히스토리 페이지가 모두 `habitschool-staging` Firebase 프로젝트를 본다.
- 추천 링크와 공유 링크는 `https://habitschool-staging.web.app` 로 생성된다.
- FCM VAPID 키는 staging 키를 사용한다.
- Functions 가 메일을 보낼 경우 링크가 staging URL 로 들어간다.

### staging smoke test

1. `https://habitschool-staging.web.app` 접속
2. Google 로그인
3. 기록 저장 및 수정
4. Cloud Function 호출이 정상 동작하는지 확인
5. 관리자 페이지 로그인 및 통계 확인
6. 소셜/개인 챌린지 생성과 응답 확인
7. 공개/비공개, 공유 링크, 초대 링크 확인
8. 푸시 권한 요청과 토큰 등록 확인

## 3. 권장 검증 순서

1. 코드 수정
2. `npm test`
3. `npm run emulators`
4. localhost 에서 1차 기능 확인
5. `npm run deploy:staging`
6. staging URL 에서 실제 서버 흐름 확인
7. 그 다음에만 prod 배포 준비

## 4. prod 배포 원칙

- prod 는 기존 규칙대로 `git commit` → `git push` → 사용자 확인 후 배포
- staging 배포는 사전 검증용이므로 prod 승인 절차와 분리
- 다만 prod 와 같은 데이터 모델 변경이라면 staging 에서 rules / indexes / functions 까지 먼저 확인한 뒤 넘긴다

## 메모

- `firebase --version` 확인 결과 CLI `15.8.0`
- 로컬에서 Firebase CLI update check 경고는 있었지만, 버전 출력과 명령 사용 자체는 가능했다
