# 2026-04-11 Mainnet Readiness Completion

## Goal

- 메인넷 전환 직전 단계에서 사람이 수동으로 옮겨 적거나 놓치기 쉬운 부분을 줄인다.
- 배포 산출물, role 부여 상태, 프런트 메인넷 주소 설정이 한 번에 맞물리도록 준비 절차를 보강한다.

## Plan

- [x] 현재 mainnet runbook / deploy scripts / frontend config 연결 방식 점검
- [x] 배포 산출물과 운영 상태를 더 완결되게 남기도록 contracts 스크립트 보강
- [x] `deployments-bsc.json` 기반 프런트 mainnet 주소 동기화 도구 추가
- [x] 메인넷 사전 점검(preflight) 스크립트 추가
- [x] 문서/스크립트 사용 순서 업데이트
- [x] 검증 실행 및 오늘 상태 정리

## Verification

- `npm test`
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
- `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-main-check.js`
- `cd contracts && npx hardhat compile`
- `cd contracts && npx hardhat test`
- `cd contracts && npm run export:abi`
- 신규 mainnet helper 스크립트 dry-run / check 실행

## Review

- 추가한 항목
  - `contracts/scripts/preflight-mainnet.js`
  - `scripts/sync-mainnet-config.js`
  - `tests/mainnet-config-sync.test.js`
- 보강한 항목
  - `deploy.js`가 초기 `serverRoles` 상태까지 배포 산출물에 기록
  - `setup-minter.js`, `revoke-roles.js`, `fix-operator.js`가 role/operator 상태를 `deployments-*.json`에 다시 기록
  - 런북과 launch guide에 `preflight` / `config sync` / `config check` 절차 추가
- 검증 결과
  - `npm test` 통과 (`132 passed`)
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js` 통과
  - `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-main-check.js` 통과
  - `cd contracts && npx hardhat compile` 통과
  - `cd contracts && npx hardhat test` 통과 (`36 passing`)
  - `cd contracts && npm run export:abi` 통과
  - `cd contracts && npm run preflight:mainnet` 결과: 운영 입력 3개 부족으로 blocked
  - `npm run mainnet:config:check` 결과: `contracts/deployments-bsc.json` 없음으로 blocked
- 현재 남은 실제 mainnet blocker
  - deployer 지갑의 BSC mainnet BNB 잔액 `0`
  - 아직 `contracts/deployments-bsc.json`이 없어서 프런트 mainnet 주소 sync/check 단계로 넘어갈 수 없음
  - `BSCSCAN_API_KEY`, `RESERVE_MULTISIG_ADDRESS`는 반영 완료
## 2026-04-11 Deployment Follow-up

- Mainnet deploy completed.
  - `HaBit`: `0xCa499c14afE8B80E86D9e382AFf76f9f9c4e2E29`
  - `HaBitStaking`: `0xaad072f6be392D30a4E094Ce1E33C36929EfE6b8`
- `setup-minter.js` initially wrote stale `false` values for `RATE_UPDATER_ROLE` / `stakingOperator` due to public BSC RPC read-after-write lag.
- Fixed `setup-minter.js`, `revoke-roles.js`, and `fix-operator.js` to poll for the expected post-transaction state before writing `deployments-*.json`.
- Re-ran `setup-minter.js`; deployment artifact now matches on-chain state:
  - `minterRoleGranted=true`
  - `rateUpdaterRoleGranted=true`
  - `stakingOperatorEnabled=true`
- Synced `js/blockchain-config.js` from `contracts/deployments-bsc.json` and confirmed `npm run mainnet:config:check` passes.
- Re-ran `npm run preflight:mainnet`; all deployment checks pass with frontend sync confirmed.
- BscScan verification is currently blocked by the explorer API migration:
  - Hardhat verify now expects an Etherscan V2 single-key flow.
  - `contracts/hardhat.config.js` was updated to prefer `ETHERSCAN_API_KEY` with `BSCSCAN_API_KEY` as fallback.
