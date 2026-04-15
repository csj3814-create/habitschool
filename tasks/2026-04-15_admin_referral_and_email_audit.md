# 2026-04-15 관리자 초대 리더보드 / 미활동 이메일 감사

> 상태: 완료

## 작업

- [x] 관리자 초대 리더보드 집계 경로 분석
- [x] 기존 회원 초대 링크 연결 누락 원인 확인
- [x] 회원 관리 탭 이메일 로그 구조 분석
- [x] 초대 리더보드가 `invite_link_existing`까지 반영되도록 수정
- [x] 회원 관리 탭에서 3일/7일 미활동 이메일 시각, 방식, 내용 확인 UI 추가
- [x] 레거시 이메일 로그도 볼 수 있도록 정규화 유틸 추가
- [x] 테스트 및 번들 검증

## 조사 메모

- 기존 관제탑 초대 리더보드는 `users.referredBy`만 집계하고 있었다.
- 그래서 신규 가입 유저 초대는 잡히지만, 기존 회원이 초대 링크를 통해 친구 연결된 경우(`friendships.source === "invite_link_existing"`)는 숫자에 반영되지 않았다.
- 관제탑 `system` 탭은 최초 1회만 로드되어, 초대 직후 탭을 다시 눌러도 새 집계가 보이지 않는 캐시성 체감 이슈도 있었다.
- 회원 관리 탭의 미활동 이메일 정보는 기존에는 `lastSentAt`, `lastSentDays`, `sentCount`만 읽어서 “언제 보냈는지” 정도만 희미하게 알 수 있었고, 발송 방식/제목/본문은 저장하지 않았다.

## 구현 메모

- `functions/admin-invite-leaderboard.js`
  - `users.referredBy`와 `friendships`의 `invite_link_signup`, `invite_link_existing`를 함께 합산한다.
  - 신규 가입 초대와 기존 회원 초대를 중복 없이 한 리더보드로 묶는다.
- `functions/index.js`
  - `getInviteLeaderboard` callable 추가.
  - `upsertActiveFriendship`에 `inviterUid`, `inviteeUid`를 저장해 이후 집계를 더 안정적으로 만든다.
  - `sendReEngagementEmailsV2` callable 추가.
  - 발송 시 `emailLogs/{uid}`에 시각, 방식, 수신 이메일, 제목, 요약, HTML 본문, 일차별 최신 로그, 최근 이력을 함께 저장한다.
- `js/admin-utils.js`
  - 새 로그 구조와 기존 `lastSentAt` 기반 레거시 로그를 공통 포맷으로 정규화한다.
- `admin.html`
  - 초대 리더보드를 새 callable 기반으로 로드하도록 변경.
  - `system` 탭 재진입 시 리더보드/관리자 목록을 다시 불러오도록 변경.
  - 회원 상세 모달에 “3일 / 7일 미활동 이메일 이력” 섹션 추가.
  - 최신 3일/7일 발송 카드와 최근 발송 이력 목록에서 시각, 방식, 수신 이메일, 제목, 요약, 본문을 볼 수 있게 구성.

## 리뷰

- 오늘 초대 2명이 리더보드에 안 올라간 현상은 코드상 재현 가능한 버그였다.
- 특히 기존 회원 초대 링크 연결은 기존 집계에서 빠지고 있었으므로 “정상 작동”이라고 보기 어렵다.
- 이번 수정으로 신규 가입 초대와 기존 회원 초대가 함께 집계되고, 관리자 화면에서도 새로고침성 갱신이 되도록 보완했다.
- 미활동 이메일 감사 정보는 이번 변경 이후 발송분부터 본문까지 상세하게 남는다.
- 과거 발송분은 저장된 데이터 범위 안에서 레거시 형태로만 표시된다.

## 검증

- `npm test`
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
- `node --check functions/index.js`
