# 관제탑 무결성·갤러리·쿠폰 상태 점검

## 목표

- 관리자 코멘트의 권한 오류를 근본적으로 해결한다.
- 관제탑의 다른 주요 기능을 권한 규칙과 대조해 같은 계열 오류를 찾고 보완한다.
- 최근 30일 상세 기록의 기존 미디어와 AI 분석을 유지하면서 갤러리 탐색을 편하게 만든다.
- 쿠폰의 공급사 문자 발송, 앱 PIN·이미지 보관, 재발송 요청을 서로 다른 증빙으로 표시한다.
- 운영 데이터는 점검 중 읽기 전용으로 유지하고, 과거 쿠폰 문서는 사용자 확인 없이 변경하지 않는다.

## 조사 결과

### 관리자 코멘트

- `admin.html`이 다른 회원의 `users/{uid}`와 `daily_logs/{uid}_{today}`를 브라우저에서 직접 수정했다.
- Firestore 규칙상 `users` 갱신은 본인만 가능하여 첫 요청부터 `Missing or insufficient permissions`가 발생했다.
- 오늘 기록이 없으면 두 번째 `setDoc(..., merge:true)`도 관리자의 빈 일일 기록 생성이 되어 실패한다.

### 다른 관제탑 기능

- 마이닝 비율 조정은 callable 실패 뒤 쓰기 금지 컬렉션에 직접 fallback해 원래 오류를 가렸다.
- 월간 MVP 수동 지급 callable은 로그인만 확인하고 관리자 권한을 검사하지 않았다.
- 신규 관리자 로그인은 보호된 관리자 문서를 클라이언트가 먼저 읽어야 해서 서버의 이메일→UID 승격 경로가 막힐 수 있었다.
- 관리자 추가·제거의 이메일/UID 문서 일관성은 별도 서버 관리가 필요해 `추후 검토`로 남긴다.

### 최근 30일 상세 기록

- 날짜별 미디어가 64px 가로 스크롤이라 여러 항목을 한눈에 보기 어려웠다.
- 확대 화면은 단일 항목만 열어 매번 닫아야 했다.
- 닫기 버튼에 포커스가 남은 채 부모를 `aria-hidden=true`로 바꿔 접근성 콘솔 경고가 발생했다.

### 정명희님 쿠폰 읽기 전용 확인

- 앱 문서에는 2,000P 차감, live 상태, 공급사 거래 ID, 재발송 요청 접수가 있다.
- PIN, 쿠폰 이미지, 발급 시각, 배송 확인 시각은 없다.
- 공급사 0201 조회는 `0000`, `1000/발송완료`, `01/발행`, 유효기간 2026-08-19를 반환했다.
- 공급사 문자 발송은 확인되지만 앱 쿠폰 보관함의 PIN·이미지 발급은 완료되지 않았다.
- 2026-07-23 사용자 직접 확인 결과, 정명희님은 공급사 기프티쇼 링크를 받아 쿠폰을 정상 확인했다. 따라서 실제 전달은 완료됐고 앱 내부 PIN·이미지 미보관만 남은 상태다.
- 최초 발급 때 13자리 epoch milliseconds를 Firestore Timestamp seconds로 저장하려다 실패한 운영 로그가 확인됐다.
- 현재 main에는 epoch 보정 코드가 있지만 운영 Functions revision에는 아직 반영되지 않았다.
- 클라이언트가 호출하는 `reconcileRewardCoupon`도 운영 Functions에 배포되지 않아 404 상태다.
- 과거 문서는 자동 수정하지 않았고 재조회·재발송·정정·환불도 실행하지 않았다.

## 최소 변경 설계

### 코멘트·관리자 권한

- `submitAdminFeedback` 관리자 callable에서 대상/문구 검증 후 사용자 투영값과 `admin_feedback` 감사 이력을 batch로 저장한다.
- 오늘 기록이 있을 때만 코멘트를 해당 기록에 붙이며, 빈 `daily_logs`는 만들지 않는다.
- 코멘트 버튼은 요청 중 비활성화해 중복 전송을 막는다.
- 마이닝 비율의 금지된 직접 쓰기 fallback을 제거하고 원래 callable 오류를 표시한다.
- 월간 MVP 수동 지급에 `assertAdminRequest`를 적용한다.
- 관리자 로그인은 서버의 `ensureAdminAccess` 결과를 먼저 사용한다.

### 최근 30일 갤러리

- 기존 수집·Storage URL 검증·AI 분석 표시를 그대로 재사용한다.
- 날짜별 미디어를 줄바꿈 그리드로 표시한다.
- 기존 라이트박스에 이전/다음, 현재/전체 카운터, 전체 썸네일 레일을 추가한다.
- 좌우 화살표, Escape, 모바일 스와이프를 지원한다.
- 닫을 때 트리거로 포커스를 먼저 되돌린 뒤 숨겨 접근성 경고를 제거한다.

### 쿠폰 상태

- `sendRstCd=1000`을 주문번호로 오인하지 않고 발송 결과 코드로 저장한다.
- `발송완료 + PIN 발행`과 앱 PIN·이미지 존재를 별도로 판단한다.
- PIN·이미지가 없는 재발송 요청은 기존 `pending_issue`를 `issued`로 승격하지 않는다.
- 관제탑과 사용자 쿠폰함에 `문자 발송 완료`, `앱 PIN 미보관`, `MMS 요청됨·배송 미확인`을 구분해 표시한다.
- 상품 이미지를 실제 쿠폰처럼 오해하지 않도록 `상품 이미지`임을 안내한다.

## 변경 파일

- `admin.html`: 코멘트 callable, 관리자 인증·마이닝 오류 처리, 30일 갤러리, 쿠폰 증빙 표시
- `functions/runtime.js`: 코멘트 callable, MVP 관리자 검증
- `functions/reward-market.js`: 공급사 상태 매핑과 재발송 상태 보존
- `js/reward-market.js`: 사용자 쿠폰함의 문자 발송/앱 PIN 상태 분리
- 관련 관리자·쿠폰 테스트
- `tasks/lessons.md`: 이번 교정에서 얻은 재발 방지 규칙

## 체크리스트

- [x] 필수 문서와 기존 변경 확인
- [x] 코멘트·관리자 권한 대조
- [x] 최근 30일 미디어·AI 분석·접근성 조사
- [x] 정명희님 쿠폰과 공급사 상태 읽기 전용 확인
- [x] 최소 변경 구현
- [x] 집중 테스트 75개 통과
- [x] 전체 Vitest 611개 통과(에뮬레이터 전용 7개 제외)
- [x] Firestore 규칙 에뮬레이터 7개 통과
- [x] Functions 문법, 앱 esbuild 번들, `git diff --check` 통과
- [x] 갤러리 데스크톱 1440×900 시각 검증
- [x] 갤러리 모바일 390×844 시각 검증
- [ ] 인증된 staging에서 코멘트 성공과 실제 미디어 탐색 확인
- [ ] staging Functions와 Hosting 배포 후 callable·쿠폰 상태 재검증
- [ ] 사용자 확인 후 커밋·푸시·배포

## 추후 검토

- 관리자 추가·해제를 이메일/UID 양쪽에 원자적으로 반영하는 전용 callable
- 공급사가 상태조회에서 PIN·이미지를 제공하지 않는 상품의 앱 보관함 정책
- 운영 쿠폰 3건의 앱 누락 정보를 공급사 증빙에 맞춰 보정할지 여부

## 검증 결과

- `npx vitest run tests/report-admin-detail-ui.test.js tests/admin-dashboard-loading.test.js tests/monthly-mvp-reward.test.js tests/reward-market.test.js tests/reward-market-admin-ui.test.js tests/reward-market-ui.test.js`: 75/75 통과
- `npm test`: 611/611 통과, 에뮬레이터 전용 7개 정상 skip
- `npm run test:emulator`: 7/7 통과
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js`: 통과
- `node --check functions/runtime.js`, `node --check functions/reward-market.js`, `git diff --check`: 통과
- 데스크톱 1440×900: 본문, 이전/다음, 카운터, 썸네일 레일이 겹치지 않음
- 모바일 390×844: 확대 미디어, 좌우 버튼, 카운터, 가로 썸네일 레일이 한 화면에서 동작 가능한 크기로 표시됨
- 실제 코멘트 callable과 공급사 상태 반영은 Functions 미배포 상태라 staging 배포 전에는 운영 UI에서 검증할 수 없음
