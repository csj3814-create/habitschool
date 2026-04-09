# BSC 메인넷 출범 준비 가이드

> 작성일: 2026-04-09
> 기준 아키텍처: `HaBit` + `HaBitStaking` 이원 구조

---

## 아키텍처

- `HaBit.sol`
  - HBT 토큰
  - 채굴 보상 mint
  - 주간 rate 조정
  - reserve 30M을 멀티시그로 직접 민팅
- `HaBitStaking.sol`
  - 위클리/마스터 챌린지 예치 보관
  - 성공 시 원금 반환
  - 실패 시 50% 반환, 50% 소각
- Cloud Functions
  - 챌린지 시작/정산 오케스트레이션
  - phase별 보너스율 정책 적용
  - 운영자 지갑 권한으로 온체인 호출

---

## 사전 조건

### 지갑

- `Deployer`
  - 컨트랙트 배포 및 admin 작업
  - 하드웨어 지갑 또는 전용 배포 지갑 권장
- `Reserve Multisig`
  - 30M HBT 보관
  - 최소 2/3 Safe 멀티시그 권장
- `Server Minter`
  - Cloud Functions용 운영 지갑
  - `MINTER_ROLE`, `RATE_UPDATER_ROLE`, `staking operator` 보유

### 환경 변수

`contracts/.env`

```env
DEPLOYER_PRIVATE_KEY=0x...
BSCSCAN_API_KEY=...
SERVER_MINTER_ADDRESS=0x...
RESERVE_MULTISIG_ADDRESS=0x...
BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545/
BSC_MAINNET_RPC_URL=https://bsc-dataseed.binance.org/
```

Functions/Secret Manager

```bash
firebase functions:secrets:set SERVER_MINTER_KEY
```

Functions runtime env

```env
HABIT_MAINNET_ADDRESS=0x...
STAKING_MAINNET_ADDRESS=0x...
ONCHAIN_NETWORK=mainnet
```

주의:
- 실제 runtime은 현재 `ONCHAIN_NETWORK=mainnet`일 때만 BSC 메인넷으로 전환되도록 설계한다.
- 메인넷 주소가 채워지기 전에는 prod도 testnet으로 남겨둔다.
- 프런트는 `js/blockchain-config.js`의 `ENABLE_PROD_MAINNET`까지 `true`로 바꿔야 prod가 메인넷으로 전환된다.
- 즉 `주소 반영`과 `prod mainnet 전환`은 같은 작업이 아니다.

---

## 배포 순서

### 1. 테스트넷 최종 검증

```bash
npm test
npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js
npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-main-check.js
cd contracts
npx hardhat compile
npx hardhat test
npx hardhat run scripts/deploy.js --network bscTestnet
npx hardhat run scripts/setup-minter.js --network bscTestnet
```

실전 리허설:

```bash
cd contracts
$env:SERVER_MINTER_PRIVATE_KEY = (firebase functions:secrets:access SERVER_MINTER_KEY --project habitschool-8497b 2>$null | Where-Object { $_ -match '^0x[0-9a-fA-F]+$' } | Select-Object -First 1)
npm run dress-rehearsal:testnet
Remove-Item Env:SERVER_MINTER_PRIVATE_KEY
```

검증:
- `deployments-bscTestnet.json` 생성
- BscScan testnet에서 `HaBit`, `HaBitStaking` 주소 확인
- Functions와 프론트가 동일 주소를 사용하도록 반영
- `contracts/dress-rehearsal-bscTestnet.json` 리포트 생성
- `mint -> stake -> success settle -> fail settle` tx hash 확보

### 2. 메인넷 배포

```bash
cd contracts
npx hardhat compile
npx hardhat run scripts/deploy.js --network bsc
```

결과:
- reserve 30M은 `RESERVE_MULTISIG_ADDRESS`로 직접 민팅
- `deployments-bsc.json` 생성

- This step deploys contracts only. Server roles are granted separately in step 3.
### 3. 운영 권한 부여

```bash
cd contracts
npx hardhat run scripts/setup-minter.js --network bsc
```

부여 권한:
- `HaBit.MINTER_ROLE`
- `HaBit.RATE_UPDATER_ROLE`
- `HaBitStaking.setOperator(serverMinter, true)`

### 4. BscScan 검증

```bash
npx hardhat verify --network bsc <HABIT_ADDRESS> <RESERVE_MULTISIG_ADDRESS>
npx hardhat verify --network bsc <STAKING_ADDRESS> <HABIT_ADDRESS>
```

### 5. 앱/Functions 주소 반영

- `js/blockchain-config.js`
  - `HBT_TOKEN.mainnetAddress`
  - `STAKING_CONTRACT.mainnetAddress`
  - keep `ENABLE_PROD_MAINNET = false`
- Functions runtime env
  - `HABIT_MAINNET_ADDRESS`
  - `STAKING_MAINNET_ADDRESS`
  - `ONCHAIN_NETWORK=mainnet`

### 6. 배포 준비 커밋

- 아직 `firebase deploy`를 실행하지 않는다.
- 메인넷 주소 반영 커밋과 최종 `ENABLE_PROD_MAINNET` 전환 커밋을 분리해서 검토 가능하게 둔다.

### 7. Hosting 반영

Release sequence:
1. `git add`
2. `git commit`
3. `git push origin main`
4. Ask the user to confirm deployment
5. Create the final `ENABLE_PROD_MAINNET = true` switch commit
6. `firebase deploy --only hosting,functions`
---

## 운영 스크립트

### 역할 부여

```bash
npx hardhat run scripts/setup-minter.js --network bsc
```

### 역할 회수

```bash
npx hardhat run scripts/revoke-roles.js --network bsc
```

### staking operator만 긴급 수정

```bash
OPERATOR_ADDRESS=0x... OPERATOR_ENABLED=false npx hardhat run scripts/fix-operator.js --network bsc
```

### Server Minter 가스 충전

```bash
ONCHAIN_NETWORK=mainnet FUND_AMOUNT=0.02 node scripts/fund-minter.js
```

---

## 최종 체크리스트

- [ ] Safe 멀티시그 준비 완료
- [ ] `RESERVE_MULTISIG_ADDRESS` 실주소 확인
- [ ] `SERVER_MINTER_ADDRESS` 실주소 확인
- [ ] `SERVER_MINTER_KEY`가 실제로 위 주소의 개인키와 일치하는지 검증 완료
- [ ] `contracts/.env` 정리 완료
- [ ] `firebase functions:secrets:set SERVER_MINTER_KEY` 완료
- [ ] `npm test` 통과
- [ ] `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js` 통과
- [ ] `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-main-check.js` 통과
- [ ] `npx hardhat test` 통과
- [ ] `deployments-bsc.json` 생성 및 보관
- [ ] BscScan 검증 완료
- [ ] `HABIT_MAINNET_ADDRESS`, `STAKING_MAINNET_ADDRESS` 반영 완료
- [ ] `ONCHAIN_NETWORK=mainnet` 전환 완료
- [ ] Functions 로그에서 `mint`, `prefund`, `challenge settle` 정상 확인
- [ ] 소액 챌린지 예치/성공 정산/실패 정산 실제 검증 완료

---

## 런북

- 메인넷 운영 절차와 사고 대응은 [bsc-mainnet-operations-runbook.md](/C:/SJ/antigravity/habitschool/tasks/bsc-mainnet-operations-runbook.md)를 기준으로 진행한다.
