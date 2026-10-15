# 체성분 쇼츠 — 스토리보드 v1 (2026-10-07)

세로 9:16, 약 23초, 무음(음악은 인스타·유튜브 앱에서 붙인다). 사용법 5편(체성분 기록)과 같은 내용.
방식: AI 정지 이미지 4장(Higgsfield 웹, FLUX.2 Pro 또는 Seedream 5.0 Lite 무제한) + 실제 앱 캡처 2장 → ffmpeg로 천천히 확대·이동 + 자막.

- 무제한은 higgsfield.ai **웹 화면에서만** 된다. MCP로 부르면 "Unlimited generations aren't supported"가 나오고 장당 1크레딧이 빠진다(10-07 확인).
- 웹에서도 **입력창의 Unlimited 스위치를 켜야** 무제한으로 생성된다(끄면 생성하기 버튼에 1크레딧이 붙는다). 결과는 720x1280.
  웹에서 만든 결과의 원본 주소는 MCP `show_generations`의 rawUrl로 받을 수 있다.
- 10-08 v1 완성: k01~k04 모두 FLUX.2 Pro 무제한(크레딧 3 그대로). k04는 자막을 위쪽(y=520)에 둠.
- 앱 화면은 AI로 그리지 않는다. 실제 캡처만 쓴다(posts/05_body_composition/captures).
- 이미지 저장 위치: `Downloads\해빛스쿨_홍보영상\body_composition\` 에 k01.png ~ k04.png
- 편집: `python marketing/video/body_composition/edit.py` → 같은 폴더 body_composition_ko.mp4

## 장면

| # | 길이 | 그림 | 자막 |
|---|---|---|---|
| 1 | 3.0s | k01 서랍 속 결과지 (AI) | 인바디 결과지, 어디 두셨어요? |
| 2 | 3.2s | k02 아침 욕실 체성분 체중계 (AI) | 석 달 뒤에 다시 재도 / 지난번 숫자가 없으면 비교를 못 하잖아요 |
| 3 | 2.6s | k03 결과지를 휴대폰으로 찍는 손 (AI) | 사진 한 장 올리시면 |
| 4 | 4.2s | captures/02 사진 읽은 결과 (캡처) | AI가 읽어서 칸을 채워 드려요 / 저장은 숫자 보시고 직접 |
| 5 | 3.6s | captures/05 변화 추이 (캡처) | 잴 때마다 날짜별로 쌓여요 |
| 6 | 3.2s | k04 아침 창가의 체중계 (AI) | 같은 기기로, 같은 시간에 재 주세요 |
| 끝 | 3.0s | 끝 카드 (스크립트가 만듦) | 해빛스쿨 / 프로필 링크에서 시작하세요 |

- 5번 변화 추이에는 10-04 줄(골격근량 32.9)이 튀어서 "골격근량 +4.1kg"이 보인다. 게시 전 사용자 확인 필요(capture_plan.md와 같은 문제).

## 이미지 지시문 (Higgsfield 웹, 비율 9:16)

모든 지시문 뒤에 붙인다:
```
photorealistic, natural soft morning light, Korean apartment interior, shallow depth of field,
calm warm color grade, no readable text, no logos, no faces, vertical 9:16
```
- 결과지와 휴대폰의 글자는 AI가 깨뜨리니 **초점 밖으로 흐리게** 둔다. 얼굴은 넣지 않는다(손·발만).

**k01 서랍 속 결과지**
```
An open wooden desk drawer seen from above, a slightly crumpled printed body composition analysis sheet
lying among old receipts, a pen and a charging cable, the printed sheet has bar charts but its text is
out of focus and unreadable, dust in a soft beam of morning light
```

**k02 아침 욕실 체성분 체중계**
```
Close-up of bare feet stepping onto a white smart body composition scale with metal electrode pads,
on a light gray bathroom tile floor, a folded towel nearby, early morning window light, the scale display
is blurred and unreadable
```

**k03 결과지를 찍는 손**
```
Over-the-shoulder view of two hands holding a smartphone above a printed body composition result sheet
on a kitchen table, taking a photo of it, the phone screen faces away from the camera, the printed sheet
is soft-focus with unreadable text, a cup of coffee beside it, morning light
```

**k04 아침 창가의 체중계**
```
A white smart scale resting on a wooden floor next to a bright window at sunrise, a pair of slippers
beside it, a small plant on the windowsill, peaceful and hopeful mood, lots of empty space at the top
of the frame
```
