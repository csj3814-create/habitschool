# 해빛스쿨 v1.0.0 정리 메모

## 이번 정리에서 한 일
- 사용자에게 보이는 `changelog.html`을 UTF-8 기준으로 다시 작성
- `v1.0.0` 릴리즈 노트와 본서버 배포 체크리스트를 새로 정리
- 로컬 전용 파일인 `.firebase/hosting..cache`, `.claude/settings.local.json`은 추적 해제 대상으로 분리
- `.gitignore` 하단 깨진 항목을 정리

## 본서버 배포 범위
- 현재 `main`에 들어가 있는 앱 코드
- 릴리즈/배포 문서
- 사용자 안내용 changelog

## 이번 배포 범위에서 뺀 것
- 메인넷 토큰 이전
- WalletConnect 실연결
- 로컬 개발용 캐시, 로컬 설정, 임시 스크립트

## 배포 전에 꼭 유지할 원칙
- `git add -> git commit -> git push origin main -> 사용자 확인 -> firebase deploy --only hosting,functions`
- staging 확인 없이 본서버 바로 배포 금지
- 메인넷 관련 문구는 보수적으로 유지

## 배포 후 안정화 기간에 볼 것
- 저장 속도, 동영상 썸네일, 공유 카드 생성
- 친구 요청/수락/챌린지 시작
- 외부 지갑 연결과 기존 앱 지갑 내보내기 안내
- 프로필/자산/갤러리의 모바일 레이아웃 유지
