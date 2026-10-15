# 플레이스토어 출시 영상 — 스토리보드 v1 (2026-10-14)

계획: tasks/todo_2026-10-14_play_launch_promo_video.md
- 세로 9:16, 무음 → 음악은 앱에서 붙이거나 편집 때 넣고 -14 LUFS 로 맞춘다(recut_endcards.loudnorm_filter).
- 끝 카드: brand.endcard() — "Google Play에서 '해빛스쿨' 검색" + 아이폰은 웹 주소.
- 끝 카드에 200P 는 쓰지 않는다. 초대 링크로 들어온 경우에만 주는 거라 스토어 검색 가입과 맞지 않는다.
- 얼굴은 넣지 않는다(손·발·뒷모습). 컷마다 사람이 바뀌어도 티가 나지 않고, AI 얼굴의 어색함도 피할 수 있다.
- 기능 문구는 앞 게시물(posts/02~07)에서 이미 확인한 사실만 쓴다. 수면 '헬스커넥트 자동 가져오기'는 1.0.10 심사 중이라 쓰지 않는다(수면 앱 캡처로 설명).
- 말투: marketing/WRITING_VOICE.md. 자막은 말하듯이, 격언형 마무리 없이.

종류: **AI** = 무제한 이미지 → (10-27 이후) Kling 3.0 Turbo 3초 · **REC** = 사용자 화면 녹화 · **IMG** = 이미 있는 이미지

## 공통 이미지 지시문 꼬리
```
photorealistic, natural light, Korean apartment interior, shallow depth of field, calm warm color grade,
no readable text, no logos, no faces, vertical 9:16
```

---

## A. 출시 대표 영상 (약 30초)

| # | 길이 | 종류 | 그림 | 자막 |
|---|---|---|---|---|
| A1 | 3.0 | AI `a_alarm` | 새벽, 침대 옆 휴대폰 알람을 끄는 손 | 건강 챙기겠다고 앱 깔았다가 / 사흘 만에 지운 적 있으시죠? |
| A2 | 3.0 | AI `k02` | 체중계에 오르는 맨발 | 그래서 적지 않고 / 찍기만 하면 되게 만들었어요 |
| A3 | 3.0 | AI `a_breakfast` | 아침상을 휴대폰으로 찍는 손 | 아침상 한 장 찍으시면 |
| A4 | 4.0 | REC 식단 | AI 분석 결과 | AI가 음식마다 / 자연·가공·초가공을 나눠 줘요 |
| A5 | 3.0 | AI `a_walk` | 아침 출근길을 걷는 운동화 | 걸음수는 저절로 들어오고요 |
| A6 | 3.0 | REC 걸음 | 걸음수가 들어온 운동 탭 | (자막 없음 — A5 이어서) |
| A7 | 3.0 | AI `a_night` | 밤, 협탁 위 충전 중인 휴대폰과 스탠드 | 잠은 수면 앱 캡처 한 장이면 돼요 |
| A8 | 4.0 | REC 점수 | 건강 점수 → 30일 결과지 | 쌓인 기록은 점수랑 / 한 달 결과지로 보여 드려요 |
| A9 | 3.0 | REC 스토어 | 플레이스토어에서 '해빛스쿨' 검색 | 이제 플레이스토어에서 받으실 수 있어요 |
| 끝 | 3.5 | 끝 카드 | brand.endcard(line='오늘 한 끼만 찍어 보세요') | |

16:9 판(플레이스토어 등록정보 홍보 동영상): 같은 컷을 가운데 세로로 두고 양옆을 흐린 같은 화면으로 채운다. 끝 카드는 endcard_16x9.

## B. 기능 쇼츠 (각 약 15초)

| 편 | 1 (AI 3초) | 2 (REC 5초) | 3 (4초) | 끝 3초 |
|---|---|---|---|---|
| B1 식단 | `a_breakfast` "오늘 먹은 초가공식품, 몇 개일까요?" | 식단 AI 결과 "사진 한 장이면 음식마다 나눠 줘요" | REC 하루 총평 "칼로리는 일부러 뺐어요 / 사진으로는 양을 알 수 없거든요" | 오늘 한 끼만 찍어 보세요 |
| B2 걸음 | `b_shoes` 운동화 끈 묶는 손 "이번 주에 운동, 몇 분 하셨어요?" | 이번 주 운동 막대 "남은 양을 오늘치로 나눠 드려요" | `a_walk` "주 150분, 하루로 나누면 20분 남짓이에요" | 오늘은 20분만 걸어 보세요 |
| B3 수면 | `b_dawn_bed` 새벽빛 이불 "어젯밤, 몇 시간 주무셨어요?" | 수면 캡처 올리기 → A~F "아침에 캡처 한 장이면 돼요" | `a_night` "워치랑 수면 앱이 이미 재고 있으니까 / 저희는 읽기만 해요" | 오늘 밤 7시간 |
| B4 체성분 | `k01` "인바디 결과지, 어디 두셨어요?" | 결과지 사진 → 칸 채움 "AI가 읽어서 칸을 채워 드려요" | `k04` "같은 기기로, 같은 시간에 재 주세요" | 결과지 한 장부터 |
| B5 점수 | `b_bp` 아침 식탁 위 혈압계·혈당계 "혈압이랑 공복혈당, 재고 나서 어디 적으세요?" | 건강습관 점수·대사건강 점수 "적어 두면 점수 두 개로 보여 드려요" | REC 점수 카드 "다음에 채우면 좋은 항목 하나만 알려 드려요" | 오늘 아침 숫자 하나부터 |
| B6 30일 | `b_calendar` 벽 달력 넘기는 손 "한 달 동안 어떻게 지냈는지 기억나세요?" | 30일 결과지 넘기기 "기록 30일치를 한 장으로 모아 드려요" | REC 달력 "안 적은 날은 빈칸으로 둬요 / 안 걸은 거랑 안 적은 건 다르니까요" | 오늘부터 30일 |

## 새로 만들 이미지 (무제한, 웹 FLUX.2 Pro 9:16 + Unlimited 스위치)

| 이름 | 지시문 앞부분 (+ 공통 꼬리) | 움직임 지시 (Kling 3초) |
|---|---|---|
| a_alarm | A hand reaching out from under a duvet to switch off a smartphone alarm on a bedside table, dim blue dawn light through curtains, cozy bedroom | the hand slowly reaches and taps the phone, curtains sway slightly |
| a_breakfast | Top-down view of a simple Korean breakfast table (rice, soup, grilled fish, vegetables, kimchi) with two hands holding a smartphone above it taking a photo, phone screen facing away from the camera, warm morning sunlight | the hands raise the phone and hold still for the shot, steam rises from the soup |
| a_walk | Low angle close-up of white sneakers walking on a sunlit apartment complex sidewalk lined with trees in the morning, autumn leaves, motion feeling | the feet walk forward toward the camera, leaves drift, camera tracks backward slowly |
| a_night | A smartphone charging face-down on a wooden bedside table next to a warm reading lamp and a glass of water, a bed with a soft duvet in the background, calm night | the lamp light flickers gently, slow push in |
| b_shoes | Close-up of two hands tying the laces of running shoes on a wooden entrance floor (Korean apartment genkan), morning light from the door | the hands pull the laces tight and finish the knot |
| b_dawn_bed | A rumpled bed with white sheets in soft dawn light, an open window with sheer curtains, a smartphone on the pillow, peaceful morning | the sheer curtains billow gently, light grows warmer |
| b_bp | A kitchen table in the morning with a home blood pressure monitor cuff, a small glucose meter and a cup of tea, soft sunlight, the device displays are blurred and unreadable | steam rises from the tea, sunlight shifts slowly |
| b_calendar | A hand turning the page of a wall calendar in a bright kitchen, the calendar dates are blurred and unreadable, morning light | the hand flips the calendar page up |

이미 있는 것: k01·k02·k04 (Downloads\해빛스쿨_홍보영상\body_composition\, k02 job 1876e9e6-0716-4a03-b8cb-2aedef1ff33e)

## 받을 화면 녹화 (사용자, 각 10초 안팎)
1. 식단 탭 아침 사진 올리기 → AI 분석 결과 (+ 하루 총평까지 내리면 B1-3도 됨)
2. 운동 탭 — 걸음수 들어온 화면, 이번 주 운동 막대
3. 수면 캡처 올리기 → A~F 분석
4. 체성분 결과 사진 → 칸 채움 (저장 안 함)
5. 내 기록 탭 — 건강습관·대사건강 점수 → 맨 아래 30일 결과지 → 달력
6. 플레이스토어 앱에서 '해빛스쿨' 검색 → 앱 페이지
