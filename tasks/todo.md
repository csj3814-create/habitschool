# 2026-03-28 세션 완료 보고 (2차)

> **상태**: ✅ 전체 완료 · main push · Firebase 배포 완료

---

## 오늘 완료한 작업

### 1. 가입 축하금 200P + 온보딩 환영 메시지 ✅
- `awardWelcomeBonus` CF: welcomeBonusGiven 플래그로 중복 방지
- `grantWelcomeBonusToAll` CF: 기존 회원 소급 지급 (admin 전용)
- index.html 온보딩 모달에 🎁 가입 축하 200P 배너 추가
- 추천 +200P / 가입 축하 +200P / 리액션 +1P 전체 동작 검증 완료

### 2. FCM 푸시 알림 ✅
- sw.js: Firebase Messaging compat + onBackgroundMessage
- js/auth.js: `registerFCMToken()` — 권한 요청 → fcmToken Firestore 저장
- functions/index.js:
  - `sendDailyReminder` (KST 20:00): 오늘 기록 없는 유저 알림
  - `sendStreakAlert` (KST 22:00): 연속 습관 달성 위기 알림
  - `sendBroadcastNotification`: 관제탑에서 전체 즉시 발송

### 3. 관제탑(admin.html) 개선 ✅
- 포인트&HBT 탭 버그 수정 (Firestore rules + MVP 필드)
- 기록 유형별 도넛 차트: awardedPoints 기준 집계 + 숫자 표시
- 챌린지 현황: 진행 중 / 완료 대기 / 누적 완료 컬럼 추가
- 포인트 수동 조정 + 전체 푸시 발송 UI

### 4. 지갑 탭 오늘 P ✅
- 리액션 수신(내 오늘 게시물 좋아요) + 발신(오늘 누른 좋아요) 포함

### 5. 친구 초대 QR 코드 모달 ✅
- 📱 QR 코드 버튼 (지갑/프로필 탭)
- 화면 93% 어둡게 + 모달에 QR 2개 크게 표시
  - 내 초대 링크 QR (초대 코드 라벨 포함)
  - 해빛스쿨 단톡방 QR (https://open.kakao.com/o/gv23urgi)
- qrcodejs@1.0.0 CDN 사용 (브라우저 검증 완료)

### 6. 카카오톡 공유 버그 수정 ✅
- 기존: `Kakao.Share.sendDefault` → 데스크탑에서 빈 화면
- 수정: `navigator.share` (모바일 네이티브 공유 시트) + 데스크탑 링크 복사 안내

### 7. 저장 시 수면 데이터 소실 버그 수정 ✅
- **원인**: `getDoc` 2초 타임아웃 → 느린 네트워크에서 `oldData = {}` fallback
  → `sleepAndMind.sleepImageUrl = null`로 덮어써짐
- **수정**: Firestore 캐시 우선 즉시 읽기 → 네트워크 최대 8초 대기
  - 영상 업로드 중 네트워크 불안정해도 캐시에서 기존 데이터 보존

---

## 커밋 이력 (오늘 2차)

| 커밋 | 내용 |
|------|------|
| `02ea952` | fix: 저장 시 getDoc 캐시 우선 읽기로 수면 데이터 소실 방지 |
| `b79aac6` | fix: QR 모달 복사 버튼 제거 + 카카오 공유 navigator.share로 교체 |
| `993c23d` | fix: QR 코드 라이브러리 qrcodejs로 교체 |
| `07e618d` | feat: 친구 초대 QR 코드 모달 |
| `12b6623` | fix: 지갑 오늘 P — 리액션 수신/발신 포인트 포함 |
| `15ce49b` | feat: 도넛 차트 숫자 표시 + 챌린지 현황 누적 완료 |
| `4626ed2` | fix: 기록 유형별 도넛 차트 awardedPoints 기준 수정 |

---

## 다음 할 일 (우선순위순)

### 🔴 안정성 검증
- [ ] **영상 업로드 재시도 UX**: 30초+ 업로드 중 네트워크 에러 발생 시 사용자 안내 개선
- [ ] **FCM 스케줄 함수 실행 확인**: Cloud Scheduler에서 실제 트리거 로그 확인

### 🟡 사용자 경험
- [ ] **회원별 개별 알림**: admin에서 특정 유저에게 타겟 푸시 발송
- [ ] **관제탑 신고 처리 UI**: 신고 승인/반려/처리 완료 액션
- [ ] **firebase-admin v12 → v13**: breaking changes 검증 후 업그레이드

### 🟢 낮은 우선순위
- [ ] **CDN SRI 해시 추가**: ethers.js, html2canvas, exif-js
- [ ] **communityStats 캐시 활용**: 관제탑 대시보드 상단 표시
- [ ] **갤러리 콘텐츠 관리**: 관제탑에서 게시물 직접 삭제

### 🔵 메인넷 작업 (별도 세션)
- [ ] 테스트넷 마무리 검증 (챌린지 보상 수령 전체 플로우)
- [ ] 메인넷 컨트랙트 배포
- [ ] 메인넷 배포 후 monitoring 체계 구축
