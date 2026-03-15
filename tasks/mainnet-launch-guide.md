# Base 메인넷 출범 준비 가이드

> **작성일:** 2026년 3월 13일  
> **프로젝트:** 해빛스쿨 (HabitSchool)

---

## 🔴 Phase 1: 사전 준비 (보안 & 자산)

### 1-1. 멀티시그 지갑 생성 (리저브 30M 관리용)
- [Safe (구 Gnosis Safe)](https://app.safe.global)에서 Base 메인넷용 멀티시그 지갑 생성
- **최소 2/3 다중서명** 설정 권장
- 이 주소를 deploy 시 `reserveWallet`으로 사용
- 현재는 deployer 지갑에 30M이 바로 들어가는데, 프로덕션에서는 위험함

### 1-2. 지갑 3개 준비

| 지갑 | 용도 | 보관 방식 |
|------|------|-----------|
| **Deployer** | 컨트랙트 배포 + Admin 역할 | 하드웨어 지갑 (Ledger 등) |
| **Server Minter** | Cloud Functions에서 mint 호출 | Firebase Secret Manager |
| **Reserve (멀티시그)** | 30M HBT 보관·관리 | Safe 멀티시그 |

### 1-3. 배포 가스비 준비
- Deployer 지갑에 **Base 메인넷 ETH 약 0.01~0.05 ETH** 충전
  - Base는 L2라 가스비가 매우 저렴
- ETH 구매 → Base 브릿지: https://bridge.base.org

---

## 🟡 Phase 2: 스마트 컨트랙트 감사 & 테스트

### 2-1. 보안 감사
실제 자산이 걸리므로 **최소 1개 이상의 감사**를 권장:

| 옵션 | 비용 | 기간 |
|------|------|------|
| **자체 감사** (Slither, Mythril) | 무료 | 1~2일 |
| **커뮤니티 감사** (Code4rena, Sherlock) | $5K~$50K | 1~4주 |
| **전문 감사** (OpenZeppelin, Trail of Bits) | $50K+ | 4~8주 |

최소한 자동화 도구로 점검:
```bash
# Slither 정적 분석
pip install slither-analyzer
cd contracts
slither .
```

### 2-2. 테스트넷 최종 검증
```bash
cd contracts
npx hardhat test              # 유닛 테스트
npx hardhat run scripts/deploy.js --network baseSepolia  # 테스트넷 재배포 확인
```

---

## 🟢 Phase 3: 메인넷 배포

### 3-1. 환경변수 설정
```env
# contracts/.env
DEPLOYER_PRIVATE_KEY=0x메인넷_배포자_개인키
BASESCAN_API_KEY=basescan에서_발급받은_API키
SERVER_MINTER_ADDRESS=0x서버민터_지갑주소
```

### 3-2. 컨트랙트 배포
`deploy.js`에서 `reserveWallet`을 멀티시그 주소로 변경 후:

```bash
cd contracts
npx hardhat compile
npx hardhat run scripts/deploy.js --network base
```

배포 결과가 `deployments-base.json`에 기록됨.

### 3-3. Basescan 컨트랙트 검증
```bash
npx hardhat verify --network base 0x배포된_HaBit_주소 "0x리저브지갑주소"
npx hardhat verify --network base 0x배포된_Staking_주소 "0x배포된_HaBit_주소"
```

---

## 🔵 Phase 4: 서버 & 프론트엔드 전환

### 4-1. Cloud Functions 업데이트
`functions/index.js` — 현재 **테스트넷 하드코딩**을 메인넷으로 변경:

```javascript
// 변경 전 (테스트넷)
const HABIT_ADDRESS = "0xb144a143be3bC44fb13F3FAE28c9447Cee541d1B";
const RPC_URL = "https://sepolia.base.org";
const CHAIN_ID = 84532;
const EXPLORER_URL = "https://sepolia.basescan.org";

// 변경 후 (메인넷)
const HABIT_ADDRESS = "0x메인넷에_배포된_주소";
const STAKING_ADDRESS = "0x메인넷에_배포된_스테이킹_주소";
const RPC_URL = "https://mainnet.base.org";
const CHAIN_ID = 8453;
const EXPLORER_URL = "https://basescan.org";
```

이후 재배포:
```bash
cd functions
firebase deploy --only functions
```

### 4-2. 프론트엔드 설정 업데이트
`js/blockchain-config.js`의 `mainnetAddress` 필드에 실제 주소 입력:

```javascript
mainnetAddress: '0x메인넷에_배포된_주소',
```

---

## 🟣 Phase 5: 출시 후 운영

### 5-1. 모니터링
- **Basescan** 알림 설정 (대량 전송, 의심 트랜잭션)
- Cloud Functions 로그 모니터링 (Firebase Console)
- 일일 민팅량 서킷 브레이커 동작 확인

### 5-2. 주간 난이도 조절 스크립트
`contracts/scripts/difficulty_adjuster.py`를 메인넷 대상으로 크론잡 설정 (매주 월요일 0시 KST)

### 5-3. 유동성 풀 (선택)
DEX 상장을 원하면:
1. Uniswap V3 (Base 체인) 풀 생성
2. 리저브에서 HBT + ETH 페어로 초기 유동성 공급
3. 가격 범위(range) 설정

---

## 📋 최종 체크리스트

| # | 항목 | 상태 |
|---|------|------|
| 1 | 멀티시그 지갑 생성 (리저브용) | ⬜ |
| 2 | 하드웨어 지갑 준비 (Deployer) | ⬜ |
| 3 | Server Minter 지갑 생성 | ⬜ |
| 4 | 보안 감사 (최소 Slither) | ⬜ |
| 5 | Base 메인넷 ETH 충전 | ⬜ |
| 6 | deploy.js에 멀티시그 주소 반영 | ⬜ |
| 7 | 메인넷 컨트랙트 배포 | ⬜ |
| 8 | Basescan 검증 | ⬜ |
| 9 | functions/index.js 메인넷 전환 | ⬜ |
| 10 | blockchain-config.js 주소 업데이트 | ⬜ |
| 11 | Firebase Functions 재배포 | ⬜ |
| 12 | 소액 mint 테스트 | ⬜ |
| 13 | 난이도 조절 크론잡 설정 | ⬜ |
| 14 | 모니터링 알림 설정 | ⬜ |

---

## ⚠️ 핵심 주의사항

- **보안 감사**와 **멀티시그 지갑**이 가장 중요
- 단일 개인키로 30M 토큰을 관리하는 것은 반드시 피할 것
- 메인넷 전환 전 테스트넷에서 모든 플로우를 최종 검증할 것
- 개인키는 절대 코드나 저장소에 포함하지 말 것 (`.gitignore` 확인)
