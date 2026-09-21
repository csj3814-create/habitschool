// 회원 미디어가 사는 곳. **여기가 정본이다.**
//
// 2026-09-21 질문: "무슨 에러가 이리 많지?" 스테이징 콘솔에 이런 줄이 있었다.
//
//   Refused to load the image 'https://storage.googleapis.com/…'
//   because it violates the following Content Security Policy directive: "img-src …"
//
// 그 주소 자체는 지금 코드가 만들지 않는 옛 자료였지만, 조사하다 보니 호스트
// 이름이 **세 곳에 따로 박혀 있었다.** 그리고 어긋났을 때의 증상이 제각각이다.
//
//   firebase.json              CSP img-src / media-src  → 사진이 안 보인다
//   js/security.js             isValidStorageUrl        → 저장이 거부된다
//   functions/points-utils.js  파싱 + 포인트 증빙 검증    → 포인트가 안 나간다
//
// 화면이 비는 것은 바로 보인다. **포인트가 조용히 안 나가는 쪽은 아무도 모른다** —
// 2026-08-15 에 동의 기록이 나흘간 거부된 것과 같은 종류의 침묵이다.
//
// 런타임에 셋이 이 파일을 함께 읽게 만들 수는 없다. 이유가 분명하다.
//
//   - 브라우저는 ESM, Cloud Functions 는 CommonJS 라 서로의 모듈을 못 읽는다
//   - 호스팅은 functions/** 를 내보내지 않는다 (firebase.json ignore)
//   - 배포되는 functions/ 는 상위 폴더를 가져가지 않아 ../ 를 못 읽는다
//   - 이 저장소에는 번들러가 없다
//
// 그래서 **여기를 정본으로 두고 나머지 두 곳이 같은지 시험이 지킨다.**
// 한쪽만 바꾸면 tests/media-host-single-source.test.js 가 깨진다.
// 호스트를 늘릴 일이 생기면 이 파일을 먼저 고치고, 시험이 가리키는 곳을 따라간다.

/** 회원 미디어를 받아 오는 호스트. 늘릴 때는 세 곳이 함께 늘어야 한다. */
export const MEDIA_HOSTS = Object.freeze([
    'firebasestorage.googleapis.com'
]);

/** 에뮬레이터로 개발할 때만 쓰는 호스트. 운영 CSP 에는 넣지 않는다. */
export const MEDIA_EMULATOR_HOSTS = Object.freeze([
    '127.0.0.1',
    'localhost'
]);

const escapeForPattern = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `https://<허용 호스트>/` 로 시작하는가. */
export function isMediaHostUrl(url) {
    const pattern = new RegExp(`^https://(?:${MEDIA_HOSTS.map(escapeForPattern).join('|')})/`);
    return pattern.test(String(url || ''));
}

/** 에뮬레이터가 내려 주는 다운로드 주소인가. */
export function isMediaEmulatorUrl(url) {
    const hosts = MEDIA_EMULATOR_HOSTS.map(escapeForPattern).join('|');
    const pattern = new RegExp(`^https?://(?:${hosts})(?::\\d+)?/v0/b/[^/]+/o/`);
    return pattern.test(String(url || ''));
}
