# 구글플레이 재신청용 테스터 메일 (초안)

- 작성일: 2026-08-31
- 대상: `해빛테스터40인` 명단 전체 (46명 + 이후 추가분)
- 배경: 2026-08-29 프로덕션 액세스 **반려**

## 반려 사유 (메일 원문)

> - 비공개 테스트 중에 **테스터가 앱에 참여하지 않았습니다.**
> - 앱 업데이트를 통해 **사용자 의견을 수집하고 조치를 취하는 등의 테스트 권장사항을
>   따르지 않았습니다.**

콘솔은 "검토일부터 14일 더"라고만 표시하지만, 기간은 결과일 뿐 조건이 아니다.
**같은 2주를 그냥 흘려보내면 9/12 에 같은 사유로 다시 반려된다.**

## 지난 메일이 틀린 안내를 했다

2026-08-05 리마인드 메일에 이렇게 썼다.

> 이미 참여해 주신 분 — 아무것도 안 하셔도 됩니다. 다만 앱을 지우지만 말아 주세요.
> **평소처럼 쓰시거나, 안 쓰셔도 설치만 되어 있으면 충분합니다.**

옵트인 12명이라는 숫자만 보고 요건을 읽었고, 구글이 **실사용**을 본다는 것을 놓쳤다.
테스터는 안내받은 대로 했을 뿐이다. 이번 메일은 그 정정에서 시작해야 신뢰가 유지된다.

## 구조적으로 불리한 조건

해빛스쿨 앱은 기존 웹 서비스의 TWA다. 테스터는 **이미 웹으로 매일 쓰는 회원**이라,
옵트인해도 평소 쓰던 웹을 계속 쓰면 Android 빌드에는 아무 활동도 남지 않는다.
그래서 이번 요청의 핵심은 "설치"가 아니라 **"2주 동안 웹 대신 앱으로"** 다.

PWA 홈화면 아이콘과 플레이스토어 설치 앱이 겉보기에 비슷한 것도 함정이다.
본문에서 구별법을 알려 준다.

## 우리 쪽에서 같이 해야 할 것

메일만으로는 두 번째 사유(업데이트·의견 반영)가 해결되지 않는다. 2주 안에
**새 versionCode 를 최소 2~3회** 트랙에 올려야 한다. 마침 영상 업로드 제보가
미해결이라, 제보 → 수정 → 배포 흐름이 그대로 근거가 된다.

---

## 메일 본문 (한국어)

**제목:** 해빛스쿨 출시 심사 결과와 부탁 — 2주만 앱으로 써주세요 🌱

안녕하세요, {이름}님. 해빛스쿨입니다.

지난주 구글에 정식 출시를 신청했는데 **반려됐습니다.** 결과부터 말씀드립니다.

### 이유는 제 안내가 잘못돼서였습니다

구글이 준 사유는 **"비공개 테스트 중에 테스터가 앱에 참여하지 않았다"** 였습니다.

지난 메일에서 제가 이렇게 썼습니다 — *"안 쓰셔도 설치만 되어 있으면 충분합니다."*
**그게 틀렸습니다.** 구글은 설치 숫자가 아니라 **앱을 실제로 쓴 기록**을 봅니다.
저는 12명이라는 숫자만 보고 조건을 다 채웠다고 생각했습니다.

여러분은 제가 안내한 대로 하셨을 뿐입니다. 죄송합니다.

### 그래서 이번엔 부탁이 하나 늘었습니다

**9월 12일까지 2주 동안, 웹 대신 앱으로 기록해 주세요.**

해빛스쿨은 원래 웹으로 쓰시던 분이 많아서, 앱을 깔아두고도 평소처럼 인터넷 주소로
들어가시면 앱에는 아무 기록이 남지 않습니다. 구글에게는 그게 "아무도 안 썼다"로
보입니다.

하루 한 번, 식단이든 운동이든 마음이든 **앱에서** 남겨 주시면 그걸로 충분합니다.

### 앱으로 들어왔는지 확인하는 법

홈 화면 아이콘이 두 종류일 수 있어서 헷갈리기 쉽습니다.

- **플레이스토어에서 설치한 앱** — 열었을 때 위쪽에 브라우저 주소창이 **없습니다.**
- 브라우저에서 '홈 화면에 추가'로 만든 바로가기 — 주소창이 보이거나, 크롬 탭으로
  열립니다.

주소창이 보인다면 앱이 아니라 웹입니다. 아래 링크로 설치해 주세요.

### 아직 설치 전이시라면 (3분)

**1.** 안드로이드 폰에서 아래 링크를 열어 주세요.
🔗 https://play.google.com/apps/testing/com.habitschool.app
※ **해빛스쿨에 로그인하시는 그 구글 계정**으로 열어야 합니다.

**2.** **"테스터 되기"** 를 누른 뒤, 안내문의 파란색 **"Google Play에서 다운로드"**
링크로 설치해 주세요. (스토어 검색으로는 안 나옵니다. 설치 버튼이 바로 안 뜨면
몇 분 뒤 다시 눌러 주세요.)

**3.** 설치 후 로그인하시면 기존 기록이 그대로 있습니다.

### 불편한 점을 알려주시는 것도 심사 항목입니다

구글이 준 두 번째 사유는 **"사용자 의견을 수집하고 조치를 취하지 않았다"** 였습니다.
그래서 이번 2주 동안은 **여러분의 회신 한 줄이 그대로 근거가 됩니다.**

느린 곳, 안 되는 곳, 어색한 곳 — 무엇이든 회신 주세요. 기기 이름(갤럭시 S24,
안드로이드 14 등)을 함께 적어주시면 훨씬 빨리 고칩니다. 받는 대로 고쳐서
업데이트로 내보내겠습니다.

지금도 영상 업로드가 멈춘다는 제보를 받아 원인을 좁히는 중입니다.

### 부담 없이 알려주세요

그만두고 싶으시면 회신 한 줄이면 됩니다. 다만 12명 아래로 내려가면 처음부터
다시 시작이라, 그만두실 계획이 있으시면 **미리** 알려주시면 큰 도움이 됩니다.

아이폰 사용자분은 이번 테스트 대상이 아닙니다(플레이스토어는 안드로이드 전용).

번거롭게 해드려 죄송합니다. 이번엔 제대로 안내드리겠습니다.

해빛스쿨 드림
문의: csj3814@gmail.com

---

## 메일 본문 (영문 — 해외 회원용)

**Subject:** Our launch review was rejected — please use the app for two weeks 🌱

Hello {name},

We applied to Google for public release last week, and **we were rejected.**
Here is what happened.

**The reason was my bad guidance.** Google's stated reason was that *testers did
not engage with the app during the closed test.* In my last email I wrote that
you did not need to use it as long as it stayed installed. **That was wrong.**
Google looks at real usage, not install counts. You did exactly what I asked.
I am sorry.

**So there is one more request this time: until 12 September, please record in
the app instead of the website.** Many of you have used Habit School in a
browser for a long time. If you open the web address as usual, nothing is
recorded against the Android app, and to Google that reads as "nobody used it."
One entry a day — food, exercise, or mind — is enough.

**How to tell you are in the app:** the app installed from Play has **no browser
address bar** at the top. If you see an address bar, that is the website, not
the app.

**Not installed yet?** Open this link on your Android phone, using **the same
Google account you sign in with**:
🔗 https://play.google.com/apps/testing/com.habitschool.app
Tap "Become a tester," then use the blue "Download it on Google Play" link.
It will not appear in store search.

**Telling us what is broken also counts.** Google's second reason was that we
did not collect and act on user feedback. So a one-line reply from you is
literally evidence. Anything slow, broken, or awkward — please reply, with your
device name. We will fix it and ship an update.

If you would like to stop, just reply. If you plan to, please tell us in
advance — dropping below 12 testers restarts the whole two weeks.

iPhone users are not part of this test (Google Play is Android only).

Sorry for the trouble, and thank you.

Habit School
Contact: csj3814@gmail.com

---

## 발송 전 확인

- [ ] 현재 옵트인 인원 확인 (12명에 걸쳐 있으면 추가 초대 먼저)
- [ ] 비공개 테스트 통계에서 실제 설치·활성 수 확인 — 메일 문구의 근거
- [ ] 문의 주소를 `csj3814@gmail.com` 으로 둘지 결정
      (스토어 등록정보는 `habitschool0@gmail.com` 이지만, 지난 두 메일이
      `csj3814` 로 나갔으므로 회신 흐름 유지를 위해 그대로 두는 쪽을 권함)
- [ ] BCC 발송 (수신자 주소 상호 노출 금지)

## 이 메일만으로는 부족하다

두 번째 반려 사유는 **우리가 업데이트를 내보내야** 해소된다.
2주 안에 최소 2~3회 새 versionCode 를 트랙에 올린다. 후보:

- 영상 업로드 실패 (제보 접수, 실패 사유 노출까지 배포됨 — 코드 회신 대기)
- 소모임 컨펌 카드 잔류 (2026-08-30 수정, 앱에는 아직 안 올라감)
- 인바디 저장 버튼 / 안내 접기 (2026-08-30 수정, 동일)

**웹은 이미 배포됐지만 트랙의 AAB 는 versionCode 5 (8/27) 그대로다.**
네이티브 변경이 없어도 새 versionCode 를 올리면 "업데이트를 냈다"는 기록이 남는다.
