# 2026-04-11 Today Priorities

## Goal

- Yesterday's wrap-up 기준으로 오늘 실제로 남아 있는 일만 추려서 한 번에 움직일 수 있는 체크리스트로 정리한다.
- 이미 방향이 바뀐 실험성 작업과 실제 launch blocker를 구분해서, 메인넷 준비와 Android 실사용 검증에 집중한다.

## Task List

- [ ] BSC 메인넷 실제 배포 실행:
  `HaBit`, `HaBitStaking` 실배포 후 주소와 배포 산출물을 확보한다.
- [ ] `contracts/deployments-bsc.json` 생성 및 배포 주소 기록:
  실제 `HABIT_MAINNET_ADDRESS`, `STAKING_MAINNET_ADDRESS`를 운영 문서와 코드 기준점에 남긴다.
- [ ] 메인넷 전환 입력값 연결:
  `ONCHAIN_NETWORK=mainnet`, production `ENABLE_PROD_MAINNET = true`, 관련 주소/env를 실제 값으로 채운다.
- [ ] 메인넷 라이브 검증:
  BscScan verify, 실제 mint/stake/settle 흐름 확인, 런북에 결과 반영.
- [ ] Android 사진 공유 유입 재검증:
  공유 시트에서 HaBit이 보이는지, 앱이 식단 기록 흐름으로 정확히 들어가는지, 이미지가 실제로 이어지는지 실기기에서 다시 확인한다.
- [ ] TWA release signing + assetlinks 적용:
  실제 release keystore 기준으로 서명/assetlinks 작업을 진행한다.
- [ ] fullscreen TWA 동작 실기기 확인:
  release signing 반영 후 삼성/One UI에서 fullscreen 동작과 런처 진입을 확인한다.
- [ ] Admin Google login staging 확인:
  `admin.html` 수정분이 staging에서 실제 로그인 전환까지 정상 동작하는지 확인하고 필요하면 재배포한다.

## Not Today Unless Priority Changes

- [ ] 외부 지갑 복귀 복구 실험 재개 금지:
  MetaMask / Trust Wallet 외부 연결은 기본 제품 경로에서 제외된 상태이므로, scratch 재설계 없이 다시 주요 작업으로 올리지 않는다.
- [ ] tokenomics 인코딩 복구는 별도 신규 작업으로 잡지 않음:
  2026-04-10 wrap-up 기준 복구와 배포가 끝난 상태라면 체크박스만 남은 예전 메모일 가능성이 높다. 실제 페이지 이상이 다시 보일 때만 재개한다.

## Verification

- `npm test`
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
- 필요 시 `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-main-check.js`
- `node --check functions/index.js`
- `cd contracts && npx hardhat compile`
- `cd contracts && npx hardhat test`
- `cd contracts && npm run export:abi`
- staging / 실기기 확인 로그 및 화면 결과 기록

## Sources

- `tasks/todo_2026-04-10_session_wrap_up.md`
- `tasks/todo_2026-04-10_mainnet_final_readiness_check.md`
- `tasks/todo_2026-04-09_today_priorities.md`
- `tasks/todo_2026-04-10_admin_google_login_regression.md`

## Review Notes

- 현재 최우선 블로커는 코드 품질보다 launch operations 쪽이다.
- 외부 지갑 연결은 여러 차례 실기기 실패 후 제품 기본 경로에서 제외되었으므로, 오늘 할 일은 "복구 실험"보다 "메인넷 전환과 Android 실사용 안정화"에 두는 편이 맞다.
