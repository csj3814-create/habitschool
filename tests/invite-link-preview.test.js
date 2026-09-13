import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readRepoFile = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');

// 2026-09-13: 블로그에 붙인 초대 링크에 미리보기가 뜨지 않았다. 원인은 두 겹이었다.
// (1) 앱이 만든 링크가 `habitschool.web.app?ref=CODE` — 도메인 뒤 슬래시가 없어
//     일부 링크 파서가 정규화하지 못했다.
// (2) 쿼리에는 전용 OG 를 붙일 수 없다. Hosting rewrite 가 쿼리스트링을 매칭하지
//     못해 ref 유무와 상관없이 같은 index.html 이 나간다.
describe('invite links can carry their own preview', () => {
    const runtime = readRepoFile('functions/runtime.js');
    const firebaseJson = JSON.parse(readRepoFile('firebase.json'));

    it('no builder emits the slash-less form any more', () => {
        const sources = ['js/app-core.js', 'js/auth.js', 'functions/runtime.js'].map(readRepoFile);
        for (const src of sources) {
            expect(src).not.toContain('APP_ORIGIN}?ref=');
            expect(src).not.toContain('APP_BASE_URL}?ref=');
        }
    });

    it('invite links use the path form that a rewrite can match', () => {
        expect(runtime).toContain('link: `${APP_BASE_URL}/i/${referralCode}`');
        expect(readRepoFile('js/auth.js')).toContain('`${APP_ORIGIN}/i/${referralCode}`');
        expect(readRepoFile('js/app-core.js')).toContain('`${APP_ORIGIN}/i/${userData.referralCode}`');
    });

    it('hosting routes /i/** to the preview function', () => {
        const rewrite = firebaseJson.hosting[0].rewrites.find((r) => r.source === '/i/**');
        expect(rewrite).toBeTruthy();
        expect(rewrite.function.functionId).toBe('inviteLinkPreview');
        expect(rewrite.function.region).toBe('asia-northeast3');
    });

    it('robots.txt is no longer excluded from the deploy', () => {
        // *.txt 가 ignore 에 있어 robots.txt 가 404 였다. 배포 범위의 .txt 는 그것 하나뿐이다.
        expect(firebaseJson.hosting[0].ignore).not.toContain('*.txt');
    });

    it('the preview names the inviter but survives a failed lookup', () => {
        const fn = runtime.split('exports.inviteLinkPreview = onRequest(')[1].split('exports.shareCardPreview')[0];
        expect(fn).toContain('님이 건강 습관에 초대했어요');
        expect(fn).toContain('당신의 건강을 위해 초대합니다');
        // 조회가 실패해도 초대는 성립한다. 미리보기를 포기하지 않는다.
        expect(fn).toContain('console.warn("[inviteLinkPreview] 초대자 조회 실패:"');
    });

    it('it sends the browser on to the existing referral flow', () => {
        const fn = runtime.split('exports.inviteLinkPreview = onRequest(')[1].split('exports.shareCardPreview')[0];
        expect(fn).toContain('const targetUrl = `${APP_BASE_URL}/?ref=${code}`;');
        expect(fn).toContain('INVITE_CODE_PATTERN.test(code)');
    });

    it('the OG image is declared at the size it actually is', () => {
        const fn = runtime.split('exports.inviteLinkPreview = onRequest(')[1].split('exports.shareCardPreview')[0];
        expect(fn).toContain('imageWidth: 1200');
        expect(fn).toContain('imageHeight: 630');
        // 공유 카드(1080x1080)의 기본값은 그대로 유지돼야 한다.
        expect(runtime).toContain('imageWidth = 1080');
        expect(runtime).toContain('imageHeight = 1080');
    });
});
