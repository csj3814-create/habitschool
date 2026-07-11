# 2026-07-10 게스트 체험·활성화 구현

## 목표

- 비로그인 사용자가 한 번의 클릭으로 Firebase와 분리된 6개 탭 체험 모드에 진입한다.
- 합성 기록과 실제 익명 활동 집계를 명확히 구분한다.
- 체험 의도를 로그인·온보딩·첫 기록·첫 보상까지 이어 준다.
- 개인 기록·갤러리·포인트 경제의 서버 경계를 출시 가능한 수준으로 강화한다.

## 구현 체크리스트

- [x] 현행 게스트/인증/탭/갤러리/포인트 흐름과 테스트 구조 점검
- [x] `GuestDemoSession`과 이벤트 허용 목록의 순수 로직 및 단위 테스트 추가
- [x] 게스트 전용 모듈·6개 탭 surface·코치카드·로컬 시뮬레이션 구현
- [x] 합성 WebP 3개 생성, 크기·메타데이터 검증, PWA v228 선캐시
- [x] 한 번 클릭 진입, 세션/history 복원, 로그인 의도 저장·복귀 연결
- [x] 신규 사용자의 primary habit 온보딩과 첫 기록 결과 패널 연결
- [x] 게스트 `daily_logs` REST/영구 캐시 제거
- [x] `gallery_posts` 정제 저장/읽기 경계 및 최근 30일 백필 도구 추가
- [x] `public_stats/guest_activity` 시간별 집계와 최소 집단 버킷 구현
- [x] 포인트·보너스·챌린지 클라이언트 쓰기 차단 및 불변 원장 강화
- [x] Firestore 규칙·화이트리스트 동기화 및 새 Storage 경로/인덱스 불필요 확인
- [x] 단위·회귀·Functions 문법·mainnet·영문·esbuild 검증
- [x] 390×844 진입·6탭·시뮬레이션·새로고침·history·네트워크 브라우저 검증
- [x] PWA 오프라인 정적 import closure와 v228 선캐시 검증
- [x] 실제 staging 데스크톱 브라우저 재검증
- [ ] 네트워크 차단 상태의 서비스워커 오프라인 reload 재검증
- [x] 변경 리뷰와 남은 후속 로드맵을 이 문서에 기록
- [x] 커밋·`origin/main` 푸시 후 배포 전 사용자 확인 요청

## 검증 기록

- `npm test`: 66개 파일, 507개 테스트 통과. Emulator 전용 7개는 일반 실행에서 제외.
- `npm run test:emulator`: 익명 개인 기록 읽기 거부, canonical 기록 ID·날짜 불변, 로그인 갤러리 읽기 허용, `gallery_posts` 클라이언트 쓰기 거부, 공개 통계 읽기 허용, 포인트·증빙 원장 경계를 포함한 7개 통과.
- `npm run check:en`, `npm run mainnet:config:check`, Functions·스크립트 전체 `node --check`, 앱 `esbuild`, `git diff --check` 통과.
- 390×844 실제 브라우저에서 한 번 클릭 진입, 6개 탭 자유 이동, 코치 1회 노출, 30+30+20P와 2,000P 쿠폰 도달, 로그인 차단, 세션 새로고침/history 복원을 확인.
- 게스트 네트워크에서 `daily_logs`, `users`, Storage, Functions 요청 0건을 확인. 선택적 공개 통계 조회 실패 시 체험이 유지되는 것도 확인.
- axe 4.12.1 일회성 검사에서 serious/critical 위반 0건. 감사 전용 스크립트와 패키지는 결과 확인 후 제거.
- 합성 WebP 3개는 720×720, 각각 55,994B/19,834B/12,832B이며 EXIF·ICC·XMP가 없고 모두 120KB 미만.
- 2026-07-11 staging 30일 백필 dry-run: 개인 로그 12개 스캔, 정제 projection 12개 예정, 실제 쓰기 0건.
- 최종 보안 재검토에서 stale trigger, unshare·댓글 경합, 걸음 이미지 덮어쓰기, 날짜 변경·동시 증빙 재사용 경로를 보강했고 남은 P1/P2 없음 확인.
- 2026-07-11 로컬 브라우저에서는 실제 오프라인 reload와 데스크톱 시각 회귀를 실행하지 못했다. staging 배포 후 데스크톱 시각 회귀는 완료했고 네트워크 차단 offline reload만 남았다.

## 리뷰

- 게스트는 sessionStorage와 로컬 합성 데이터만 사용하며, 로그인 화면에서 새 방문을 시작한다. 실제 개인 기록은 공개 통계 집계 외에 게스트에게 노출되지 않는다.
- 개인 `daily_logs`와 로그인 회원용 `gallery_posts`를 분리했다. 갤러리 공유 해제는 원본 공유 설정을 끄고 live source transaction과 재시도 trigger가 projection을 정리해 순서 역전·댓글 경합 재생성을 막는다.
- 포인트, 가입·추천 보너스, 챌린지, 반응, 알림 발송은 서버 원장과 transaction으로 통제한다. 보상 미디어는 같은 날 또는 오프라인 재생을 위한 다음 날 업로드만 허용하고 Storage generation·서버 검증 해시·UID·기록 ID·날짜·카테고리 증빙 원장으로 중복 지급을 막는다.
- 후속 UX 로드맵의 1차 범위인 생애주기 홈, 2,000P 중심 자산 화면, 첫 기록 후 개인화 알림과 정확한 딥링크를 함께 반영했다. 목적형 5탭 정보구조와 `/simple` 접근성 모드 재정의는 제품 지표 확인 뒤 진행한다.
- 프로덕션 전에는 네트워크 차단 상태의 서비스워커 오프라인 reload와 실제 기기 모바일 QA를 한 번 더 수행한다.

## Staging 배포 기록 — 2026-07-12

- 대상: `habitschool-staging`, Git `719a829`, Hosting URL `https://habitschool-staging.web.app`.
- Hosting → Functions → Firestore rules/indexes → Storage rules 순으로 배포 완료.
- Functions 73개 모두 `ACTIVE`. 신규 9개를 생성하고 구형 `awardMilestoneBonus`를 `refreshMilestones`·`claimMilestoneBonus`로 교체했다.
- `syncGalleryPostProjection`의 retry 정책은 `--force` 확인 후 배포했다. transaction과 불변 원장으로 멱등성을 보장한다.
- Functions 병렬 업데이트 중 429 mutation quota 경고가 있었지만 Firebase 자동 재시도 후 전체 배포가 성공했다.
- 최근 30일 백필: 소스 11건, 정제 projection 11건, 실제 쓰기 11건.
- 백필 결과: `gallery_posts` 11건, schema v1 11건, sourceLogId 누락 0건, 민감 금지 필드 0건.
- 공개 통계 스케줄을 수동 실행해 `public_stats/guest_activity`의 정확한 4개 필드와 7일 구간을 확인했다. staging 활성 사용자 10명 미만이라 숫자 버킷은 null이며 일반 문구를 표시한다.
- 실제 데스크톱 URL에서 6개 탭, visible surface 1개, 30+30+20P, 1,920→2,000P, 기록·자산 연동, 로그인 차단, 새로고침·history 복원을 확인했다.
- 브라우저 오류/경고 로그 0건과 service worker ready를 확인했다. 사용 중인 브라우저 제어 환경에는 네트워크 offline 전환 기능이 없어 실제 offline reload는 남아 있다.
- staging 보상 마켓은 실발급 설정을 공유하므로 QA에서 쿠폰 교환은 실행하지 않았다.
- 배포 후 공개되던 `.firebaserc`와 `firestore.indexes.json`은 Hosting ignore에 추가해 제거했다.
- 후속 보안 정리: staging의 Giftishow 환경값을 일반 환경변수에서 Secret Manager로 이전하는 것이 좋다.
