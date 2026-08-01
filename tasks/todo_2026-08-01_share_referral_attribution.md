# 2026-08-01 공유 확산 1단계 — 공유 링크에 초대 코드 + 초대 랜딩 + 측정

## 왜 이것부터인가

공유 카드 텍스트가 내보내는 주소는 `getShareTargetUrl()` → `${APP_ORIGIN}/#gallery`,
즉 **초대 코드가 없는 맨 주소**다. 초대 코드(`?ref=CODE`) 처리 흐름은 이미 완성돼 있는데
프로필 화면에만 노출된다. 그래서 지금은

- 누가 공유해서 누가 들어왔는지 알 수 없고(= 공유 효과 측정 불가),
- 공유한 사람에게 돌려줄 근거가 없고,
- 유입이 유튜브만 보이는 게 "유튜브만 되는 것"인지 "나머지가 안 잡히는 것"인지 구분이 안 된다.

뒤 단계(카드 성취 수치, 초대 보상, 동적 OG)는 전부 "개선됐는지"를 판단할 계측이 있어야
의미가 있으므로 계측을 먼저 깐다.

## 작업

- [x] 공유 텍스트/링크에 내 초대 코드를 붙인다
- [x] 초대 링크로 들어온 비로그인 방문자에게 초대 안내를 보여준다
- [x] 공유 발생과 초대 링크 유입을 GA 이벤트로 남긴다
- [x] 영문판 문구
- [x] 테스트

## 상세

### 1. 공유 링크에 초대 코드 (js/app-core.js)

- `getMyReferralCode()` — 로그인 시 이미 DOM에 채워지는 초대 코드를 읽는다
  (`readSimpleProfileReferralDomState()` 재사용). 없으면 빈 문자열.
- `getShareTargetUrl()` — 코드가 있으면 `${APP_ORIGIN}/?ref=CODE#gallery`, 없으면 기존 그대로.
  코드를 못 구했다고 공유가 막히면 안 된다.
- `buildShareCaption()` / `buildShareCopyText()` — 받는 사람에게 누를 이유를 준다.

주의: `?ref=`는 해시 앞에 와야 한다. `auth.js`가 `window.location.search`로 읽는다.

### 2. 초대 랜딩 (index.html, js/auth.js)

- `?ref=`를 달고 들어온 비로그인 방문자의 로그인 화면 위에 초대 배너를 띄운다.
- 초대한 사람 이름은 **표시하지 않는다.** 이름을 보여주려면 비로그인도 부를 수 있는
  공개 callable이 필요한데, 6자리 코드를 훑어 남의 표시 이름을 긁을 수 있게 된다.
  이름은 카카오톡에 뜬 공유 카드 이미지와 캡션에 이미 들어 있어 맥락은 충분하다.

### 3. 측정 (js/product-events.js)

기존 GA 이벤트 체계(값 allowlist 기반, 자유 텍스트 금지)를 그대로 따른다.

- `share_card_sent` — 공유가 실제로 나간 시점. `share_method`로 경로 구분.
- `invite_link_landing` — 초대 링크로 진입. 로그인 여부를 `status`로 구분.
- 새 차원 `share_method`: `web_share_files` / `web_share_text` / `platform_modal` /
  `clipboard` / `download` / `unavailable`

가입 귀속 자체는 이미 서버(`processReferralSignup` → `referredBy`)에 남으므로 건드리지 않는다.

## 검증

- `npm test`
- `npx esbuild js/app-core.js --bundle`
- `npm run build:en && npm run check:en`
- 스테이징에서 공유 텍스트에 `?ref=`가 붙는지, 그 주소로 들어갔을 때 초대 배너가 뜨는지

## Review

- 공유 카드가 내보내는 주소가 초대 코드를 달고 나간다. 기존 초대 처리 흐름
  (`persistPendingInviteRef` → `processReferralSignup` / `acceptInviteLinkFriendship`)을
  그대로 타므로 **서버·규칙 변경은 없었다.**
- 초대 코드는 `window.__HABITSCHOOL_REFERRAL_CODE`로도 publish한다. 공유 카드가
  프로필 화면보다 먼저 만들어질 수 있어 DOM만 보면 코드를 놓친다.
- 초대 배너는 이름 없이 "무엇을 얻는지"만 말한다. 공개 callable을 새로 열지 않았다.
- GA 이벤트 2개(`share_card_sent`, `invite_link_landing`)를 추가해 2~5단계의 효과를
  전후로 비교할 기준선을 만들었다.

### 검증 결과

- `npm test` 656 passed
- esbuild 번들 통과(app-core, auth), `build:en` / `check:en` 통과
- localhost 실측:
  - `?ref=AB12CD` 진입 → 배너 표시, `pendingReferralCode=AB12CD` 저장, 콘솔 에러 없음
  - `?ref=` 없이 진입 → 배너 `hidden`
  - 링크 생성: 코드 있음 → `.../?ref=AB12CD#gallery`, 코드 없음/형식 오류 → `.../#gallery`
  - 캡션 분기: 초대 링크일 때만 친구 연결·보너스 문구가 붙음

### 남은 것

- 2단계: 저장 직후 공유 유도 1탭
- 3단계: 카드에 성취 숫자(연속일, 주간 완주율) 크게
- 4단계: 초대 보상 양방향 + 카드에 명시
- 5단계: 동적 OG (링크 미리보기 = 내 카드)
