# 2026-03-28 세션 완료 보고

> **상태**: ✅ 전체 완료 · main push · Firebase 배포 완료

---

## 오늘 완료한 작업

### 1. 가입 축하금 200P + 온보딩 환영 메시지 ✅
- `awardWelcomeBonus` CF: welcomeBonusGiven 플래그로 중복 방지
- `grantWelcomeBonusToAll` CF: 기존 회원 소급 지급 (admin 전용)
- index.html 온보딩 모달에 🎁 가입 축하 200P 배너 추가
- 추천 +200P / 가입 축하 +200P / 리액션 +1P 전체 검증 완료

### 2. FCM 푸시 알림 ✅
- `sw.js`: Firebase Messaging compat 추가 + onBackgroundMessage
- `js/auth.js`: `registerFCMToken()` — 알림 권한 요청 → Firestore fcmToken 저장
- `functions/index.js`:
  - `sendDailyReminder` (cron UTC 11:00 = KST 20:00): 오늘 기록 없는 유저
  - `sendStreakAlert` (cron UTC 13:00 = KST 22:00): 연속 습관 달성 위기 알림
  - `sendBroadcastNotification` (admin CF): 전체 즉시 발송
  - `sendMulticast` helper: 500개 청크 + UNREGISTERED 토큰 자동 삭제

### 3. 관제탑(admin.html) 개선 ✅
- **포인트&HBT 탭 버그 수정**: HBT 트랜잭션/마이닝 레이트/MVP 조회 불가 → Firestore rules 수정
- **MVP m.winner 버그**: `winners?.[0] || winner` 로 수정
- **포인트 지급 내역**: 최근 30건, 식단/운동/마음 분류 표시
- **기록 유형별 도넛 차트**: awardedPoints 기준으로 집계 수정 + 숫자 표시
- **챌린지 현황**: 진행 중 / 완료 대기 / 누적 완료 컬럼 추가
- **포인트 수동 조정**: 회원 상세 모달에 수동 P 조정 UI
- **전체 푸시 발송**: 초대&시스템 탭에 즉시 발송 UI

### 4. 지갑 탭 오늘 P 수정 ✅
- 기존: awardedPoints(식단/운동/마음)만 반영
- 변경: 리액션 수신(내 오늘 게시물 좋아요) + 리액션 발신(내가 오늘 준 좋아요) 포함

---

## 커밋 이력 (오늘)

| 커밋 | 내용 |
|------|------|
| `12b6623` | fix: 지갑 오늘 P — 리액션 수신/발신 포인트 포함 |
| `15ce49b` | feat: 도넛 차트 숫자 표시 + 챌린지 현황 누적 완료 추가 |
| `4626ed2` | fix: 기록 유형별 도넛 차트 — awardedPoints 기준으로 수정 |
| `cc82028` | feat: 관제탑 기능 확장 — 푸시발송/포인트조정/차트/챌린지현황 |
| `8a83ed4` | fix: admin 포인트&HBT 탭 오류 수정 + 포인트 지급 내역 추가 |
| `cc074f9` | feat: FCM 푸시 알림 구현 |
| `5b571f9` | feat: 가입 축하금 200P + 온보딩 환영 메시지 |

---

## 다음 할 일 (우선순위순)

### 🔴 인프라 / 안정성
- [ ] **firebase-admin v12 → v13 업그레이드**: breaking changes 검증 후 진행
- [ ] **FCM 스케줄 함수 실행 확인**: Cloud Scheduler에서 sendDailyReminder/sendStreakAlert 실제 트리거 테스트

### 🟡 사용자 경험
- [ ] **회원별 개별 알림**: admin에서 특정 유저에게 타겟 푸시 발송
- [ ] **관제탑 신고 처리 UI**: 신고 승인/반려/처리 완료 액션 버튼
- [ ] **AI 분석 사용량 모니터링**: Gemini API 호출 횟수 집계 (관제탑)

### 🟢 낮은 우선순위
- [ ] **CDN SRI 해시 추가**: ethers.js, html2canvas, exif-js에 `integrity` 속성
- [ ] **communityStats 캐시 활용**: `meta/communityStats` 데이터를 관제탑 대시보드 상단에 표시
- [ ] **갤러리 콘텐츠 관리**: 관제탑에서 특정 게시물 직접 삭제

### 🔵 메인넷 작업 (별도 세션)
- [ ] 테스트넷 마무리 검증 (챌린지 보상 수령 전체 플로우)
- [ ] 메인넷 컨트랙트 배포
- [ ] 메인넷 배포 후 monitoring 체계 구축
