# 2026-07-14 관제탑 총 회원 0 수정

## 계획

- [x] 관련 교훈과 관제탑 클라이언트/서버 스냅샷 계약 확인
- [x] 총 회원만 0이 되는 데이터 변환 경로의 근본 원인 확인
- [x] 선택적 크기 override의 null 처리 수정
- [x] 회귀 테스트와 필수 빌드 검증
- [ ] 변경 검토, 커밋, 푸시

## 원인

`createAdminSnapshot(summary.users)`는 명시적 크기 override 없이 회원 배열을 전달한다. 기존 구현은 기본값 `null`에 `Number(null)`을 적용해 유효한 `0`으로 판단했고, 실제 회원 행이 있어도 `usersQ.size`를 0으로 만들었다. 행 순회는 정상이라 TOP 5와 총 회원 카드가 서로 어긋날 수 있었다.

## 리뷰

- 운영 Functions 로그에서 관리자 인증과 `getAdminDashboardSnapshot` 호출은 정상이며 오류가 없음을 확인했다.
- `createAdminSnapshot([{ id: 'a' }, { id: 'b' }]).size === 2`와 명시적 override 동작을 테스트로 고정했다.
- `npm test`: 549 passed, 7 skipped.
- 필수 esbuild 브라우저 번들 검사 통과.
- 수정은 `admin.html`의 로컬 어댑터뿐이라 Functions 재배포는 필요하지 않고 Hosting 배포만 필요하다.
