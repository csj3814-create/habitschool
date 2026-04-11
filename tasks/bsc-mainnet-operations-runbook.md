# BSC 메인넷 운영 런북

> 작성일: 2026-04-09
> 대상: HaBit / HaBitStaking / Cloud Functions 운영팀

---

## 1. 목표

- BSC 단일 체인 기준으로 운영한다.
- 토큰과 챌린지 예치는 분리한다.
  - `HaBit`: token + mint + rate
  - `HaBitStaking`: 예치 custody + 성공 반환 + 실패 소각
- 메인넷 전환 후에도 장애 시 즉시 역할 회수와 운영 축소가 가능해야 한다.

---

## 2. 운영 원칙

### 체인 원칙

- 단일 체인: `BSC`
- 테스트 검증: `bscTestnet`
- 실제 운영: `bsc`

### 권한 원칙

- reserve 30M은 deployer가 아닌 `Reserve Multisig`가 직접 받는다.
- Cloud Functions 지갑은 필요한 최소 권한만 가진다.
- 배포 직후와 사고 직후에는 항상 권한 상태를 재검증한다.

### 챌린지 원칙

- 상한: `10,000 HBT`
- Phase 기본 보너스율:
  - Phase 1: `200%`
  - Phase 2: `100%`
  - Phase 3: `50%`
  - Phase 4: `25%`
  - Phase 5+: 계속 반감
- 참여 압력 증가 시 한 단계 추가 반감

운영 지표:
- `MSE30 = 최근 30일 마스터 완주 예치금 총합 / 10,000`
- 기준:
  - `MSE30 < 3`: 기본 보너스율 유지
  - `MSE30 >= 3`: 다음 배치부터 한 단계 추가 반감
  - `MSE30 >= 5` 2회 연속: 추가 반감 유지 + 운영 검토
  - `MSE30 < 1.5` 2회 연속: 기본 보너스율 복귀 검토

주의:
- 보너스율 변경은 `이미 시작된 챌린지`에 소급 적용하지 않는다.
- `새로 시작하는 챌린지`부터만 적용한다.

---

## 3. 배포 전 Go / No-Go

### Go 조건

- [ ] `cd contracts && npm run preflight:mainnet` 통과
- [ ] `npm run mainnet:config:check` 통과
- [ ] `npx hardhat test` 통과
- [ ] `npm test` 통과
- [ ] `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js` 통과
- [ ] `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js` 통과
- [ ] `deployments-bsc.json` 생성 완료
- [ ] BscScan 검증 완료
- [ ] Functions `ONCHAIN_NETWORK=mainnet` 전환 값 확인
- [ ] frontend `mainnetAddress` 반영 확인
- [ ] 소액 mint / stake / success settle / fail settle 실제 검증 완료

### No-Go 조건

- 컨트랙트 주소가 프론트, Functions, 문서에서 서로 다름
- reserve 민팅 대상이 멀티시그가 아님
- `SERVER_MINTER_ADDRESS`와 Secret Manager 키가 서로 안 맞음
- `prefundWallet`, `mint`, `challenge settle` 로그 확인 실패
- BscScan 검증 전까지 mainnet launch 금지

---

## 4. 일상 운영 체크

### 매일

- Functions error log 확인
- `mintHBT` 실패율 확인
- `startChallenge` / `claimChallengeReward` / 실패 정산 에러 확인
- `prefundWallet` 호출량 급증 여부 확인

### 매주

- `MSE30` 산출
- phase별 보너스율 유지/추가 반감 여부 결정
- 최근 7일 실제 채굴량 대비 목표치 확인
- `rateHistory`와 실제 `updateRate` 성공 로그 점검

### 매월

- reserve 잔액, mining pool 소진량, 총 소각량 점검
- 운영 권한 재감사
- 멀티시그 signer 점검

---

## 5. 핵심 스크립트

### 배포

```bash
cd contracts
npm run preflight:mainnet
npx hardhat run scripts/deploy.js --network bsc
```

### 테스트넷 드레스 리허설

```bash
cd contracts
$env:SERVER_MINTER_PRIVATE_KEY = (firebase functions:secrets:access SERVER_MINTER_KEY --project habitschool-8497b 2>$null | Where-Object { $_ -match '^0x[0-9a-fA-F]+$' } | Select-Object -First 1)
npm run dress-rehearsal:testnet
Remove-Item Env:SERVER_MINTER_PRIVATE_KEY
```

산출물:
- `contracts/dress-rehearsal-bscTestnet.json`
- fresh testnet `HaBit`, `HaBitStaking` 주소
- `mint`, `stake`, `success settle`, `fail settle` tx hash

주의:
- BSC testnet RPC는 `tx.wait()` 직후 `balanceOf()`가 잠깐 이전 상태를 돌려줄 수 있다.
- 리허설 스크립트는 post-settlement balance와 `challengeStakes`가 기대값으로 수렴할 때까지 폴링한다.

### 권한 부여

```bash
npx hardhat run scripts/setup-minter.js --network bsc
```

### 권한 회수

```bash
npx hardhat run scripts/revoke-roles.js --network bsc
```

### staking operator만 차단

```bash
OPERATOR_ADDRESS=0x... OPERATOR_ENABLED=false npx hardhat run scripts/fix-operator.js --network bsc
```

### server minter 가스 충전

```bash
ONCHAIN_NETWORK=mainnet FUND_AMOUNT=0.02 node scripts/fund-minter.js
```

---

## 6. 사고 대응

### 시나리오 A: 비정상 mint 발생

증상:
- 예상보다 큰 HBT 발행
- 일일 채굴량 급증
- 비정상 지갑으로 반복 mint

즉시 조치:
1. `revoke-roles.js`로 `MINTER_ROLE`과 `RATE_UPDATER_ROLE` 회수
2. Functions traffic에서 관련 endpoint 호출 중지 여부 확인
3. Firestore `blockchain_transactions`로 영향 범위 산정
4. 원인 분류:
   - Secret 유출
   - 서버 로직 오류
   - rate 계산 오류

복구:
1. 새 server minter 지갑 생성
2. Secret 교체
3. 원인 수정 후 `setup-minter.js`로 재부여
4. 소액 테스트 후 정상화

### 시나리오 B: 챌린지 정산 실패

증상:
- 성공/실패 정산이 Firestore에는 반영되는데 온체인 tx 없음
- Functions에서 `resolveChallenge` 에러 반복

즉시 조치:
1. `fix-operator.js`로 operator 상태 확인
2. `deployments-bsc.json`의 staking 주소와 Functions env 주소 일치 여부 확인
3. 특정 유저 stake 존재 여부를 BscScan/contract read로 확인

복구:
1. 잘못된 주소/권한 수정
2. 대상 사용자만 수동 정산
3. 재시도 전에 중복 정산 여부 확인

### 시나리오 C: prefundWallet 과다 호출

증상:
- gas 지급 횟수 급증
- 특정 계정/디바이스에서 반복 요청

즉시 조치:
1. 호출 user 패턴 확인
2. abuse 의심 계정 임시 차단
3. 필요 시 Functions 호출 제한 강화

복구:
- 서버 측 rate limit 조정
- 24시간 제한 및 잔액 threshold 재검토

### 시나리오 D: 운영자 키 유출 의심

즉시 조치:
1. `revoke-roles.js` 즉시 실행
2. Secret Manager 키 폐기
3. 새 지갑 생성
4. Functions secret 교체
5. 검증 후 `setup-minter.js` 재실행

---

## 7. 비상 축소 모드

pause 기능이 없으므로 아래 순서로 축소한다.

1. `MINTER_ROLE` 회수
2. `RATE_UPDATER_ROLE` 회수
3. `staking operator` 회수
4. 필요 시 frontend에서 챌린지 CTA 임시 비활성
5. 상태 공지 후 원인 분석

이 순서면:
- 신규 mint 중단
- 신규 온체인 정산 중단
- 기존 토큰 이동 자체는 유지

---

## 8. 배포 후 첫 24시간 집중 관찰

- 1시간 내
  - mint 1건 이상
  - stake 1건 이상
  - success settle 1건
  - fail settle 1건
- 6시간 내
  - rate update scheduler 로그 확인
  - prefundWallet 오남용 여부 확인
- 24시간 내
  - reserve/mint/slash/returned 수치 스냅샷 저장
  - `MSE30` 초기 기준선 기록

---

## 9. 운영 메모

- 메인넷 배포 전에 주소를 먼저 바꾸지 않는다.
- mainnet 전환은 `deployments-bsc.json`, frontend config, Functions env가 모두 일치한 뒤 한 번에 한다.
- 메인넷에서 문제가 나면 가장 먼저 역할을 회수하고, 그 다음 사용자 공지와 원인 분석으로 간다.

---

## 10. Helper Commands

- Preflight before a real deploy:
  `cd contracts && npm run preflight:mainnet`
- Sync frontend mainnet addresses from the deployment artifact:
  `npm run mainnet:config:sync`
- Verify that `js/blockchain-config.js` matches `contracts/deployments-bsc.json`:
  `npm run mainnet:config:check`
- Final prod-mainnet switch commit:
  `npm run mainnet:config:enable`

## 2026-04-11 Verify Note

- Hardhat verify now uses the Etherscan V2 single-key flow.
- Prefer `ETHERSCAN_API_KEY` in `contracts/.env`.
- `BSCSCAN_API_KEY` can remain as a fallback, but verification may fail if only the old explorer-specific key is present.
