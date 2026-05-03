# 2026-05-04 오늘의 명상 음성/소리 안내 개선

> 상태: 진행 중

## 작업
- [x] `tasks/lessons.md`에서 명상/UTF-8 관련 교훈 확인
- [x] 현재 명상 타이머와 소리 cue 구조 확인
- [x] 호흡형 명상 단계에 `voiceCue` 메타 추가
- [x] 첫 2회전 TTS 안내와 이후 톤 안내 구현
- [x] 안내 켬/끔 문구 반영
- [x] 테스트 보강
- [x] `npm test` 실행
- [x] esbuild 번들 검증 실행
- [x] 결과 리뷰 기록

## 구현 메모
- 별도 녹음 파일 없이 브라우저 `speechSynthesis`를 사용한다.
- TTS 미지원 또는 실패 환경에서는 기존 Web Audio 톤 안내로 fallback한다.
- 기존 `habitschool-meditation-sound-v1` 저장 키는 유지한다.

## 리뷰
- `js/meditation-guide.js`에 호흡형 명상 단계별 `voiceCue`를 추가했다.
- `js/app-core.js`는 첫 2회전에는 브라우저 TTS를 우선 사용하고, 이후 또는 TTS 미지원 시 Web Audio 톤으로 안내한다.
- 일시정지, 중단, 완료, 안내 끔, 날짜/로그 UI 재적용 시 남은 음성 cue를 취소한다.
- `index.html`의 초기 버튼 문구와 런타임 버튼 문구를 `안내 켬/끔`으로 맞췄다.
- 검증: `npm test` 통과 (`41 files`, `280 tests`), esbuild 번들 검증 통과.
- 브라우저 스모크: `http://127.0.0.1:5173/#sleep` 로드, 명상 DOM의 `안내 끔`/`시작` 문구 확인, 콘솔 error 0건. 로그인 모달 때문에 실제 카드 클릭/청음은 자동화 환경에서 진행하지 못했다.
