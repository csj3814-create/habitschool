# 2026-04-02 세션 완료 보고

> **상태**: ✅ 전체 완료 · main push · Firebase 배포 완료 (habitschool) · Render 자동 배포 (habitchatbot)

---

## 이번 세션 완료한 작업

### 1. HBT 일일 변환 한도 상향 ✅
- `functions/index.js`: `MAX_DAILY_HBT` 5,000 → 12,000
- 배경: 1:4 변환율에서 3,000P → 12,000 HBT이므로 기존 한도가 너무 작았음
- 토크노믹스 검토: 온체인 USER_DAILY_CAP(20K) 이내, Phase 1 주간 목표(140K) 안전 범위 확인

### 2. 관제탑 포인트 지급 내역 통합 테이블 ✅
- 기존: 일반 포인트 / 특수 포인트 테이블 분리
- 변경: "모든 포인트 지급 내역" 단일 테이블로 통합
- 포함 항목: 일일 습관 포인트 + 월간 MVP + 소셜 챌린지 보상 + 가입 축하 + 초대 이벤트
- Firestore index 오류 수정: `blockchain_transactions` 쿼리에서 `orderBy` 제거 → 클라이언트 정렬

### 3. 관제탑 MVP 특정 월 배포 버튼 ✅
- "특정 월 배포" 버튼 + `distributeMvpForMonth()` 함수 추가
- 2월/3월 과거 데이터 소급 배포 가능

### 4. 커뮤니티 통계 백필 ✅
- `backfillCommunityStatsArchive` onCall Cloud Function 추가
- 관제탑에서 "🗂 과거 커뮤니티 통계 백필" UI로 실행
- 2월/3월 통계 백필 성공 확인

### 5. 소셜 기능 1단계: 친구 활동 피드 ✅

**A1. 대시보드 친구 오늘 현황 카드** (`js/app.js`, `index.html`)
- 친구의 오늘 식단🥗 / 운동🏃 / 마음🌙 체크 여부 표시
- 연속 기록일(🔥 N일) 표시
- 친구 없으면 카드 숨김

**A2. 스트릭 달성 시 친구 알림** (`functions/index.js`)
- 3 / 7 / 14 / 30일 스트릭 달성 시 친구에게 `friend_streak` 알림
- 중복 방지: `daily_logs.streakNotifiedDays` 배열로 마일스톤 기록
- 클라이언트: 새 friend_streak 알림 toast 표시

**Firestore 인덱스 추가** (`firestore.indexes.json`)
- `notifications`: `postOwnerId ASC + type ASC + createdAt DESC`

### 6. auth.js createdAt 필드 추가 ✅
- 첫 로그인 시 `createdAt: serverTimestamp()` 저장
- 추후 소셜 챌린지 계정 나이 검증에 활용

### 7. 어뷰징 안전장치 설계 ✅ (2단계 구현 시 적용)
| 안전장치 | 효과 |
|---|---|
| 쌍방 친구 확인 | 부계정 일방 등록 방지 |
| 최소 5일 활동 이력 | 신규 부계정 즉시 참가 차단 |
| 양쪽 최소 1일 활동 | Stake Siphon 차단 |
| 스테이크 최대 200P | 피해 규모 제한 |
| createdAt 필드 | 계정 나이 추후 활용 |

### 8. 카카오톡 챗봇 친구 추가 기능 ✅ (`habitchatbot`)

**신규 파일**: `commands/addFriend.js`
- `!내코드`: 내 referralCode(6자리) 조회 → 친구에게 공유
- `!친구 [코드]`: 코드로 상대방 조회 → `friends` 배열에 arrayUnion
- 검증: 코드 형식(영숫자 6자), 자기자신 방지, 이미 친구 확인, 최대 3명 제한

**수정 파일**: `routes/kakao.js`, `routes/messengerbot.js`
- import + 라우팅 추가
- 도움말(HELP_MSG)에 `!내코드`, `!친구 코드` 항목 추가

---

## 커밋 이력 (이번 세션)

### habitschool
| 커밋 | 내용 |
|------|------|
| `(backfill)` | feat: 커뮤니티 통계 백필 Cloud Function + 관제탑 UI |
| `(mvp)` | feat: 관제탑 특정 월 MVP 배포 버튼 |
| `(hbt-limit)` | fix: HBT 일일 변환 한도 5000 → 12000 |
| `(points-table)` | feat: 관제탑 포인트 지급 내역 통합 테이블 |
| `(social-1)` | feat: 소셜 1단계 — 친구 활동 카드 + 스트릭 알림 |
| `(auth-createdat)` | feat: auth.js 첫 로그인 시 createdAt 저장 |

### habitchatbot
| 커밋 | 내용 |
|------|------|
| `380d88b` | feat: 카카오톡 챗봇 친구 추가 기능 (!내코드, !친구 명령어) |

---

## 다음 단계: 소셜 챌린지 2단계 (미착수)

### 구현 범위
1. **Cloud Functions** (`functions/index.js`)
   - `createSocialChallenge` — 챌린지 생성 + 초대 알림
   - `respondSocialChallenge` — 수락(포인트 락업) / 거절
   - `settleSocialChallenge` — 결산 로직
   - `settleDueSocialChallenges` — 매일 00:10 KST 자동 결산 스케줄

2. **Firestore** (`firestore.rules`, `firestore.indexes.json`)
   - `social_challenges` 컬렉션 읽기/쓰기 규칙

3. **프론트엔드** (`js/app.js`, `index.html`)
   - 챌린지 생성 UI (단체 목표 / 1:1 경쟁 선택)
   - 초대 수락/거절 UI
   - 진행 중 챌린지 현황 카드
   - 결산 결과 표시

### Firestore 구조
```
social_challenges/{challengeId}
{
  type: 'group_goal' | 'competition',
  status: 'pending' | 'active' | 'settled' | 'cancelled',
  creatorId, invitees[], participants[],
  durationDays: 3 | 7 | 14,
  startDate, endDate, expiresAt (createdAt + 48h),
  targetCompletionPct: 0.7,      // 단체 목표
  stakePoints, stakes: {uid: N}, // 경쟁 모드
  results: {uid: {habitPoints, bonusPoints, outcome}}
}
```

### 보상 구조
| 케이스 | 결과 |
|---|---|
| 단체 목표 — 전원 70%+ 달성 | 각자 +20% of 기간 습관 포인트 |
| 단체 목표 — 1명이라도 미달 | 패널티 없음 |
| 경쟁 승리 | 스테이크 회수 + 상대 스테이크 + 기간 포인트 30% 보너스 |
| 경쟁 패배 | 스테이크 몰수 |
| 경쟁 동점 | 양쪽 스테이크 반환, 보너스 없음 |

---

## 기존 미완료 항목 (이전 세션 이월)

### 🔴 안정성
- [ ] FCM 스케줄 함수 실행 로그 확인 (Cloud Scheduler)

### 🟡 사용자 경험
- [ ] 관제탑 신고 처리 UI (승인/반려/처리 완료)
- [ ] 회원별 개별 타겟 푸시 알림

### 🟢 낮은 우선순위
- [ ] CDN SRI 해시 추가 (ethers.js, html2canvas, exif-js)
- [ ] 갤러리 콘텐츠 관리 (관제탑에서 게시물 직접 삭제)

### 🔵 메인넷 (별도 세션)
- [ ] 테스트넷 전체 플로우 검증
- [ ] 메인넷 컨트랙트 배포
- [ ] 메인넷 모니터링 체계 구축
