import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readAppSource, readFunctionsSource, readRepoFile } from './source-helpers.js';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hostingConfig = () => {
    const config = JSON.parse(readFileSync(resolve(ROOT_DIR, 'firebase.json'), 'utf8'));
    return Array.isArray(config.hosting) ? config.hosting[0] : config.hosting;
};

// 카톡·페북 크롤러는 자바스크립트를 실행하지 않는다. 앱 주소를 붙여넣으면
// index.html에 박힌 고정 og:image만 읽어 가므로, 열 명이 각자 다른 카드를 공유해도
// 미리보기가 전부 똑같았다. 카드마다 짧은 주소를 만들어 그 카드를 가리키게 한다.
describe('share card link preview', () => {
    it('serves crawler metadata from a route of its own', () => {
        const functionsSource = readFunctionsSource();
        const rewrites = hostingConfig().rewrites || [];

        expect(functionsSource).toContain('exports.shareCardPreview = onRequest(');
        expect(functionsSource).toContain('<meta property="og:image" content="${safeImage}">');
        // 사람은 앱으로 넘어가야 하고, 초대 귀속이 끊기면 안 된다.
        expect(functionsSource).toContain('`${APP_BASE_URL}/?ref=${refCode}&card=${encodeURIComponent(token)}#gallery`');
        // 리라이트가 없으면 /c/... 는 그냥 index.html이 되어 고정 미리보기로 돌아간다.
        const shareRewrite = rewrites.find((entry) => entry.source === '/c/**');
        expect(shareRewrite?.function?.functionId).toBe('shareCardPreview');
    });

    it('never renders crawler-supplied values straight into the page', () => {
        const functionsSource = readFunctionsSource();

        expect(functionsSource).toContain('function escapeHtmlAttribute(');
        expect(functionsSource).toContain('const safeImage = escapeHtmlAttribute(imageUrl);');
        expect(functionsSource).toContain('const safeTarget = escapeHtmlAttribute(targetUrl);');
        // 토큰은 경로에서 그대로 오므로 형식을 통과한 것만 조회한다.
        expect(functionsSource).toContain('if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) {');
    });

    it('keeps shared cards out of reach once they expire', () => {
        const functionsSource = readFunctionsSource();

        // 만료된 카드는 미리보기도 막고, 파일과 문서를 모두 지운다.
        expect(functionsSource).toContain('if (expiresAtMs && expiresAtMs < Date.now()) {');
        expect(functionsSource).toContain('exports.cleanupExpiredShareCards = onSchedule(');
        expect(functionsSource).toContain('await bucket.file(storagePath).delete({ ignoreNotFound: true });');
    });

    it('opens the image to crawlers without opening anything else', () => {
        const storageRules = readRepoFile('storage.rules');
        const firestoreRules = readRepoFile('firestore.rules');

        // 크롤러는 getDownloadURL이 발급한 토큰 URL로 가져가고 그 토큰은 규칙과
        // 무관하게 열린다. 경로까지 공개하면 남의 uid를 아는 사람이 파일을 훑을 수 있다.
        expect(storageRules).toContain('match /share_cards/{userId}/{fileName} {');
        const shareCardBlock = storageRules.split('match /share_cards/{userId}/{fileName} {')[1].split('}')[0];
        expect(shareCardBlock).toContain('allow read: if request.auth != null && request.auth.uid == userId;');
        expect(shareCardBlock).not.toContain('allow read: if true;');
        // 쓰기는 본인만. 남의 경로에 카드를 심을 수 있으면 안 된다.
        expect(storageRules).toContain('&& request.auth.uid == userId');
        // 토큰 문서는 클라이언트가 읽지 못한다. 토큰만 알면 남의 카드 정보를
        // 훑을 수 있게 되면 안 된다(미리보기 함수는 관리자 권한으로 읽는다).
        expect(firestoreRules).toContain('match /share_cards/{token} {');
        expect(firestoreRules).toContain('allow read: if false;');
        expect(firestoreRules).toContain("request.resource.data.userId == request.auth.uid");
    });

    it('mints a fresh token per card because chat apps cache previews', () => {
        const appSource = readAppSource();

        expect(appSource).toContain('function createShareCardToken()');
        expect(appSource).toContain('_shareCardToken = createShareCardToken();');
        expect(appSource).toContain('return `${APP_ORIGIN}/c/${ensureShareCardToken()}`;');
        // 로그인 전이거나 코드가 없으면 예전 주소로 나간다. 공유가 막히면 안 된다.
        expect(appSource).toContain('if (!auth.currentUser) return `${APP_ORIGIN}/?ref=${code}#gallery`;');
    });

    // 카톡에서 카드를 보고 눌러 들어왔는데 로그인 화면만 나오면 방금 본 카드와의
    // 연결이 끊긴다. 같은 카드를 랜딩에서 한 번 더 보여 준다.
    it('carries the card through to the landing the visitor lands on', () => {
        const functionsSource = readFunctionsSource();
        const authSource = readRepoFile('js/auth.js');
        const markup = readRepoFile('index.html');

        expect(functionsSource).toContain('`${APP_BASE_URL}/?ref=${refCode}&card=${encodeURIComponent(token)}#gallery`');
        expect(markup).toContain('id="invite-landing-card"');
        expect(authSource).toContain('if (shouldShow) showInvitedCardOnLanding();');
        // 깨진 이미지 아이콘이 뜨느니 아무것도 없는 편이 낫다.
        expect(authSource).toContain('cardEl.onload = () => { cardEl.hidden = false; };');
        expect(authSource).toContain('cardEl.onerror = () => { cardEl.hidden = true; };');
        // 주소를 정리할 때 card도 같이 지운다.
        expect(authSource).toContain("url.searchParams.delete('card');");
    });

    // 카드를 얹었더니 로그인 화면 내용이 화면보다 길어졌는데, position:fixed +
    // justify-content:center 조합이라 넘치는 만큼 위아래가 잘려 나갔다.
    // 로고와 시작 버튼이 화면 밖으로 사라졌다.
    it('scrolls the sign-in screen instead of cutting it off', () => {
        const styles = readRepoFile('styles-base.css');
        const loginBlock = styles.split('#login-modal { ')[1].split('\n}')[0];

        expect(loginBlock).toContain('overflow-y: auto;');
        // justify-content:center는 넘칠 때 위쪽을 잘라 스크롤로도 닿지 못하게 만든다.
        expect(loginBlock).not.toContain('justify-content: center;');
        // auto 마진 가운데 정렬은 공간이 모자라면 잘리는 대신 스크롤된다.
        expect(styles).toContain('#login-modal::before,');
        expect(styles).toContain('#login-modal::after {');
        expect(styles).toContain('margin: auto;');
    });

    // 로그인 전 방문자가 부르는 유일한 카드 API다. 토큰을 이미 아는 사람에게
    // 이미지 주소만 준다 — 초대한 사람이 누구인지는 나가면 안 된다.
    it('hands a logged-out visitor the image and nothing else', () => {
        const functionsSource = readFunctionsSource();
        const lookupFn = functionsSource
            .split('exports.getSharedCardImage = onCall(')[1]
            ?.split('exports.getMyInviteStatus')[0] || '';

        expect(lookupFn).not.toBe('');
        expect(lookupFn).toContain('if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return { imageUrl: "" };');
        expect(lookupFn).toContain('if (expiresAtMs && expiresAtMs < Date.now()) return { imageUrl: "" };');
        // 돌려주는 건 imageUrl 하나뿐이어야 한다.
        expect(lookupFn).not.toContain('refCode');
        expect(lookupFn).not.toContain('userId');
        expect(lookupFn).not.toContain('storagePath');
    });

    it('uploads only when the card actually leaves the app', () => {
        const appSource = readAppSource();
        const publishFn = appSource
            .split('async function publishShareCardForPreview() {')[1]
            ?.split('\n}')[0] || '';

        expect(publishFn).not.toBe('');
        // 카드를 만들 때마다 올리면 보지도 않을 이미지가 쌓인다.
        expect(publishFn).toContain('if (_publishedShareCardToken === token) return true;');
        // 미리보기 등록이 실패해도 공유 자체는 진행돼야 한다.
        expect(publishFn).toContain('return false;');
        expect(appSource).toContain('await publishShareCardForPreview();');
    });
});
