# 해빛스쿨 SNS 콘텐츠 연재 계획 (2026-09-24)

목표: 기능별 사용 설명서 + 업데이트 노트를 5개 채널에 꾸준히 올려 건강 관심층 유입.
링크 목적지: https://habitschool.web.app (둘러보기: /?guest=1)

## 채널별 형식
| 채널 | 역할 | 형식 |
|---|---|---|
| 네이버 블로그 | 검색 유입 본진 | 긴 글(1,500~2,500자) + 스크린샷 5~8장, 검색 키워드 제목 |
| 브런치 | 신뢰·스토리 | 만든 사람의 이야기("왜 이렇게 고쳤나"), 에세이 톤 |
| 페이스북 | 공유 확산 | 요약 5~7줄 + 블로그 링크 + 이미지 1~3장 |
| 인스타그램 | 시각 | 캐러셀 4~7장(1080×1350) + 캡션·해시태그, 링크는 프로필 |
| 쓰레드 | 대화 | 3~5개 짧은 연결글, 첫 글에 훅 |

## 연재 두 줄기
A. 기능별 사용 설명서 (시리즈 "해빛스쿨 사용법 N편")
 1. 해빛스쿨이 뭔가요 — 식단·운동·마음 기록과 건강습관 점수
 2. 식단 사진 한 장으로 AI 분석
 3. 운동 기록 — 주 150분(WHO) 막대, 사진·영상 AI 분석
 4. 수면 기록과 AI 분석
 5. 체성분 — 인바디/체중계 사진, Fitdays 공유 한 번 (v443·v447)
 6. 대사건강 점수 / LE8 점수 보는 법
 7. 30일 결과지 (v430)
 8. 포인트 → 커피 쿠폰 (첫 교환 1,400P, v436)
 9. 운동 소모임·100일 도전
 10. 안드로이드 앱 — 걸음수 자동(삼성헬스/헬스커넥트)
B. 업데이트 노트 — 연재와 별개. CHANGELOG.md 에 새 버전이 올라올 때마다 한 편 (예약 작업 habitschool-changelog-post, 매일 20:00 확인)

## 업데이트 노트 기준 버전
- **v447** (2026-09-24 연재 시작 시점. 이 버전까지는 업데이트 노트로 따로 쓰지 않음)

## 예약 작업
- habitschool-sns-weekly — 수·일 09:00, 사용법 연재 다음 편 원고 준비 → 승인 대기
- habitschool-changelog-post — 매일 20:00, CHANGELOG 새 버전이 있으면 업데이트 노트 원고 준비 → 승인 대기

## 진행 방식
- [ ] 스크린샷: 게스트 데모(/?guest=1) 또는 운영자 본인 계정만 사용. 다른 회원 정보 노출 금지.
- [ ] 글 초안 → posts/ 폴더(로컬)에 채널별 저장
- [ ] **게시는 매 건 사용자 확인 후** 크롬에서 진행
- [ ] 게시 기록(날짜·채널·URL) 남기기

## 결정 (2026-09-24)
- 승인: 주제별 5채널 묶음 승인 / 스크린샷: 운영자 본인 계정 / 주기: 주 2회 / 첫 글: 사용법 1편 소개
- 원고: marketing/posts/01_intro/{naver_blog,brunch,facebook,instagram,threads}.md

## 확인된 제약
- Claude in Chrome 이 blog.naver.com 을 안전 제한으로 막음 → 네이버는 원고만 드리고 게시는 사용자가 직접
- Chrome 스크린샷은 로컬 파일로 저장되지 않음 → 게시할 때 캡처해서 편집기에 바로 올림(upload_image)
- 캡처 전 body.style.zoom=1.45 로 앱 폭을 화면에 맞추고 설치 배너 숨김
- 창이 가려지면(visibilityState hidden) 캡처가 멈춤 → Chrome 창을 앞에 둬야 함
- 소모임·커뮤니티 섹션은 다른 회원 이름이 보이므로 캡처하지 않음
- 브런치·페이스북·인스타·쓰레드 로그인 확인됨

## 브랜드 이미지 (저장소 파일 → Chrome file_upload 로 경로째 올림, 캡처 불필요)
| 파일 | 크기 | 쓰는 곳 |
|---|---|---|
| icons/og-image.png | 1200×630 | 네이버·브런치 대표(커버) 이미지, 글 맨 앞 |
| icons/og-invite.png | 1200×630 | 글 끝 "시작하는 방법"/초대 링크 바로 위 ("당신의 건강을 위해 초대합니다") |
| icons/feature-graphic-*.png (기본·green·dawn·autumn·purple·ocean·coral·dark·minimal·neon) | 1024×500 | 글 중간 소제목 구분 배너. 편 주제에 맞춰: 식단→green("오늘의 식단이 내일의 건강입니다"), 운동→dawn("새벽의 한 걸음이 건강을 만듭니다"), 계절·꾸준함→autumn, 마음·수면→purple/ocean, 기본→feature-graphic.png. 한 글에 1장, 편마다 다른 색 |
| assets/guest-demo/meal.webp · exercise.webp · mind.webp | 720×720 | 해당 섹션 도입 사진, 인스타 캐러셀 표지 |
| icons/icon-512.png | 512×512 | 필요할 때만(마무리·프로필) |
- 쓰지 않음: assets/reward-market/*-logo.png (타사 상표), icons/og-image-en.png (영문)
- 비율: 앱 캡처 3~5장 + 브랜드 이미지 2~3장. 브랜드 이미지가 캡처보다 많지 않게.
- 네이버는 사용자가 올리므로 쓸 브랜드 이미지도 Downloads 폴더에 키워드 파일명으로 복사해 둔다(webp 는 jpg 로 변환).

## 게시 기록
| 날짜 | 편 | 채널 | 주소 |
|---|---|---|---|
| 2026-09-24 | 1편 소개 | 브런치 | https://brunch.co.kr/@csj3814/2520 |
| 2026-09-24 | 1편 소개 | 페이스북(개인) | https://www.facebook.com/sukjae.choi/posts/pfbid02axgTKguSG8W4Xjzat37L5SPLao5X6WRTvGCnG1tApccKWUm4mjbNywy3wYMAxCDnl |
| 2026-09-24 | 1편 소개 | 인스타 | https://www.instagram.com/csj3814/p/DbaqegJzvwD/ |
| 2026-09-24 | 1편 소개 | 쓰레드(4개 연결) | https://www.threads.com/@csj3814/post/Ddqoq4RGXO2 |
| 2026-09-24 | 1편 소개 | 브런치 재발행 | 사진 4장 + 문단 간격 |
| 2026-09-24 | 1편 소개 | 네이버 블로그(사용자 게시) | https://blog.naver.com/csj3814/224421952668 |
| 2026-09-24 | 2편 식단 AI | 브런치 (캡처 4 + 대표·초록배너·초대 이미지, 매거진 「온라인 습관학교 해빛스쿨」, 재발행 2회) | https://brunch.co.kr/@csj3814/2521 |
| 2026-09-24 | 2편 식단 AI | 페이스북(개인, 사용자 게시) | https://www.facebook.com/sukjae.choi/posts/pfbid02KrGcKHA46XubhvzS95JbKvm7WjEhUoxgFvhJJgpKbeHsrPv3wC8nkAqaqLzVuHjml |
| 2026-09-24 | 2편 식단 AI | 인스타 (캐러셀 6장 4:5, Threads 공유 끔) | https://www.instagram.com/csj3814/p/DdrGkKBk8lj/ |
| 2026-09-24 | 2편 식단 AI | 쓰레드(4개 연결) | https://www.threads.com/@csj3814/post/DdrGzwCGcKw |
| 2026-09-24 | 2편 식단 AI | 네이버 블로그(사용자 게시) | https://blog.naver.com/csj3814/224421975310 |

## 게시하며 알게 된 것
- 캡처는 반드시 scale 1 로. 축소 캡처를 올리면 그 해상도(479px)로 올라간다.
- 백그라운드 탭은 캡처가 깨진다 → 편집기 글을 임시저장하고 같은 탭에서 앱을 찍은 뒤 돌아와 붙인다.
- 브런치 편집기는 이모지를 "?" 로 바꾼다 → 브런치에는 이모지 대신 → 같은 기호.
- 브런치 발행 시 "작품 선택" 을 물음 → **2026-09-24 사용자가 「온라인 습관학교 해빛스쿨」 매거진을 만듦. 다음 편부터 브런치는 발행 창 작품 선택에서 반드시 이 매거진을 고른다(사용자 지시 2회).** (1편은 "선택 안함", 2편은 매거진에 들어가 있음)
- 브런치 본문은 paste 이벤트(text/html)로 넣으면 굵은 소제목·문단 간격이 유지된다. 사진 자리에 @@IMGn@@ 표시를 두고 커서를 그 자리에 둔 뒤 이미지 파일 입력에 올리면 그 위치에 들어간다.
- Chrome 확장 캡처는 로컬 파일로 저장되지 않는다(save_to_disk 도 경로를 주지 않음) → 네이버용 사진은 브런치·페이스북에 올라간 원본(CDN)을 내려받는다.
- 인스타 게시 화면의 "Threads 공유" 가 켜져 있다 → 게시물마다 "이 게시물 공유 안 함" 으로 끔(계정 설정은 그대로).
- 쓰레드는 한글 유니코드 이스케이프 오타에 주의(뺐 ≠ 뺀). 입력 후 화면으로 확인.
- 인스타 카드: Pillow 로 1080×1350 생성(marketing/posts/NN/instagram/). 올린 뒤 자르기 비율을 **4:5** 로 바꿔야 한다(기본 1:1 이 글자를 자름). Chrome file_upload 로 경로째 여러 장 한 번에 올림.
- 쓰레드: 작성 창 contenteditable 에 paste 이벤트로 넣고 "스레드에 추가" 로 이어 붙이면 이스케이프 오타 없이 들어간다.
- 페이스북 계정은 "항상 스토리에 게시물 공유" 로 설정돼 있다(계정 설정, 바꾸지 않음).

- 브런치 문단 간격: 붙여넣을 때 블록 사이에 <p><br></p> 를 넣는다.
- **브런치 초대 이미지**: 초대 링크 바로 위에 「초대장 도착」 이미지(t1.kakaocdn.net/brunch/service/user/2wi/image/ByEVfn4-6d3ny9nearsRsbLJEj8.png)를 넣는다. 본문 → 이미지 → 빈 줄 → 링크. 2편에서 빠뜨려 사용자가 지적함(lessons.md).
- 캡처를 로컬 파일로 빼내려고 앱 페이지에서 localhost 로 보내는 방식은 자동 모드 보안 검사에 막힘 → 쓰지 않는다.
- 브런치 사진 원본 (네이버 재사용용): t1.kakaocdn.net/brunch/service/user/2wi/image/
  hVIp3CZgcEnbr_C45wUAvQIhmh4.jpg(식단AI) · 6tyQTdbQPi3azuocP4RulT63b0Y.jpg(운동) · 5LNWuhWZxIwUVlVhdU-N71tedDo.jpg(206일) · tTvNdJrr33EVMnPraQbVuTM10yQ.jpg(주간)
- 네이버 데이터랩: 다이어트 앱 ≫ 식단기록 앱 ≫ 건강관리/습관 앱 → 주 키워드 '식단기록 앱'
- 2편 데이터랩(09-24): 초가공식품 ≈ 초가공식품 종류/리스트 ≫ 식단기록 앱 > 칼로리 계산 앱 ≈ 식단관리 앱, '식단 분석·AI 식단'은 거의 0 → 주 키워드 '초가공식품'

## 준비된 원고 (승인 대기)
- (없음) — 2편은 5채널 모두 게시 완료(09-24). 다음: 3편 운동 기록

## 리뷰
