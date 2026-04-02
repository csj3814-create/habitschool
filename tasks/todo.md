# 2026-04-02 세션 완료 보고

> **상태**: ✅ 전체 완료 · main push · Firebase 배포 완료 (hosting + functions + firestore:indexes)

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

### 6. 소셜 챌린지 2단계: 단체 목표 + 1:1 경쟁 ✅

**Cloud Functions** (`functions/index.js`)
- `createSocialChallenge`: 생성 + 쌍방 친구 확인 + 최소 5일 활동 이력 확인 + 포인트 락업
- `respondSocialChallenge`: 수락(포인트 락업) / 거절. 전원 수락 → active 전환
- `settleDueSocialChallenges`: 매일 00:10 KST 자동 결산 스케줄

**어뷰징 안전장치 (전부 구현됨)**
| 안전장치 | 효과 |
|---|---|
| 쌍방 친구 확인 | 부계정 일방 등록 방지 |
| 최소 5일 활동 이력 | 신규 부계정 즉시 참가 차단 |
| 양쪽 최소 1일 활동 | Stake Siphon 차단 |
| 스테이크 최대 200P | 피해 규모 제한 |

**결산 로직**
- 단체 목표: 전원 70%+ 달성 → +20% 습관 포인트 보너스
- 경쟁 동점: 스테이크 양쪽 반환
- 경쟁 한쪽 0일: 무효, 전액 반환 (어뷰징 차단)
- 경쟁 승리: 상대 스테이크 + 기간 포인트 30% 보너스

**Firestore** (`firestore.rules`, `firestore.indexes.json`)
- `social_challenges` 컬렉션 읽기/생성 규칙 추가
- `status+endDate`, `creatorId+status` 복합 인덱스 추가

**프론트엔드** (`js/app.js`, `index.html`)
- 대시보드: 소셜 챌린지 카드 (친구 있을 때만 표시)
- 생성 모달: 유형(단체/경쟁) → 친구 선택 → 기간(3/7/14일) → 스테이크(50/100/200P) → 생성
- 초대 응답 모달: 수락/거절
- 결산 알림 토스트: win/loss/draw/void/success/missed 각각 메시지
- UI 개선: 설명 텍스트 주황색, 기간별 성공 기준 안내, 1:1 경쟁에서 성공 기준 문구 숨김

### 7. 카카오톡 챗봇 친구 추가 기능 ✅ (`habitchatbot`)
- `commands/addFriend.js`: `!내코드`, `!친구 [코드]` 핸들러
- `routes/kakao.js`, `routes/messengerbot.js`: 라우팅 + 도움말 업데이트
- Render.com 자동 배포 완료

### 8. auth.js createdAt 필드 추가 ✅
- 첫 로그인 시 `createdAt: serverTimestamp()` 저장
- 추후 소셜 챌린지 계정 나이 검증에 활용

---

## 배포 현황

| 대상 | 배포 방법 | 상태 |
|------|-----------|------|
| habitschool hosting | `firebase deploy --only hosting,functions` | ✅ |
| habitschool functions | 동상 | ✅ (신규: createSocialChallenge, respondSocialChallenge, settleDueSocialChallenges) |
| firestore indexes | `firebase deploy --only firestore:indexes` | ✅ |
| habitchatbot | git push → Render 자동 배포 | ✅ |

---

## 커밋 이력 (이번 세션)

### habitschool
| 커밋 | 내용 |
|------|------|
| `0dca7be` | fix: 1:1 경쟁 모드에서 기간 성공 기준 문구 숨김 |
| `dedbe78` | fix: 챌린지 생성 모달 UI 개선 |
| `9d789f7` | feat: 소셜 챌린지 2단계 — 단체 목표 + 1:1 경쟁 |
| `c886cff` | feat: 소셜 기능 1단계 — 친구 오늘 활동 카드 + 스트릭 달성 알림 |
| `a27b5d8` | refactor: 포인트 지급 내역 통합 테이블로 개편 |
| `661e3f6` | feat: 일일 HBT 변환 한도 5000 → 12000으로 상향 |
| `26d4d1f` | feat: admin MVP 보상 특정 월 직접 배포 기능 추가 |
| `b964e27` | feat: 과거 커뮤니티 통계 백필 기능 추가 |

### habitchatbot
| 커밋 | 내용 |
|------|------|
| `380d88b` | feat: 카카오톡 챗봇 친구 추가 기능 (!내코드, !친구 명령어) |

---

# 다음 세션: BSC 메인넷 출시

> **준비물**: Keystone Pro 3 하드웨어 지갑

## 사전 준비 체크리스트

| # | 항목 | 상태 | 비고 |
|---|------|------|------|
| 1 | Keystone Pro 3 — Deployer 주소 확인 | ⬜ | ETH 계정 주소 메모 |
| 2 | Safe 멀티시그 지갑 생성 (리저브 30M용) | ⬜ | https://app.safe.global → BSC 선택, 2/3 서명 |
| 3 | Deployer 지갑에 BNB 충전 | ⬜ | 약 0.01 BNB (≒$5 미만) 이면 충분 |
| 4 | Slither 보안 감사 실행 | ⬜ | `pip install slither-analyzer && slither .` |
| 5 | BSC 메인넷 컨트랙트 배포 | ⬜ | deploy.js에 Safe 주소 반영 후 실행 |
| 6 | BscScan 컨트랙트 검증 | ⬜ | `npx hardhat verify --network bsc ...` |
| 7 | functions/index.js 메인넷 주소로 전환 | ⬜ | HABIT_ADDRESS, RPC_URL, CHAIN_ID 변경 |
| 8 | blockchain-config.js 주소 업데이트 | ⬜ | mainnetAddress 필드 |
| 9 | Firebase Functions 재배포 | ⬜ | `firebase deploy --only functions` |
| 10 | 소액 mint 테스트 | ⬜ | 100P → HBT 변환 실제 트랜잭션 확인 |
| 11 | 모니터링 알림 설정 | ⬜ | BscScan 알림 등록 |

## 메인넷 전환 시 변경할 코드

**`functions/index.js`**
```javascript
// 현재 (BSC 테스트넷)
const HABIT_ADDRESS   = "0xb144a143be3bC44fb13F3FAE28c9447Cee541d1B";
const STAKING_ADDRESS = "0x7e8c29699F382B553891f853299e615257491F9D";
const RPC_URL  = "https://data-seed-prebsc-1-s1.binance.org:8545/";
const CHAIN_ID = 97;
const EXPLORER_URL = "https://testnet.bscscan.com";

// 변경 후 (BSC 메인넷)
const HABIT_ADDRESS   = "0x배포_후_기록";
const STAKING_ADDRESS = "0x배포_후_기록";
const RPC_URL  = "https://bsc-dataseed.binance.org/";
const CHAIN_ID = 56;
const EXPLORER_URL = "https://bscscan.com";
```

**`contracts/hardhat.config.js`**
```javascript
bsc: {
  url: "https://bsc-dataseed.binance.org/",
  chainId: 56,
  accounts: [process.env.DEPLOYER_PRIVATE_KEY]  // ← Keystone → MetaMask export
}
```

**`contracts/scripts/deploy.js`**
```javascript
// reserveWallet을 Safe 멀티시그 주소로 변경
const reserveWallet = "0xSafe_멀티시그_주소";
```

## 주의사항
- Keystone Private Key는 절대 코드/파일에 저장 금지
- 배포 전 `contracts/.env`의 DEPLOYER_PRIVATE_KEY 확인 후 사용, 완료 후 즉시 삭제
- 멀티시그 없이 30M 토큰 단일 지갑 보관 절대 금지
- 메인넷 배포 후 테스트넷 컨트랙트 주소와 혼용 주의

---

## 기존 미완료 항목 (낮은 우선순위)

### 🟡 사용자 경험
- [ ] 관제탑 신고 처리 UI (승인/반려/처리 완료)
- [ ] 회원별 개별 타겟 푸시 알림

### 🟢 낮은 우선순위
- [ ] CDN SRI 해시 추가 (ethers.js, html2canvas, exif-js)
- [ ] 갤러리 콘텐츠 관리 (관제탑에서 게시물 직접 삭제)
