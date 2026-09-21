import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 2026-09-21 질문: "무슨 에러가 이리 많지?" 스테이징 콘솔에 이런 줄이 있었다.
//
//   Refused to load the image 'https://storage.googleapis.com/…'
//   because it violates the following Content Security Policy directive: "img-src …"
//
// 그 주소는 지금 코드가 만들지 않는 옛 자료였다. 그런데 조사하다 보니 호스트 이름이
// **세 곳에 따로 박혀 있었고**, 어긋났을 때의 증상이 제각각이었다.
//
//   firebase.json              CSP img-src / media-src  → 사진이 안 보인다
//   js/security.js             isValidStorageUrl        → 저장이 거부된다
//   functions/points-utils.js  파싱 + 포인트 증빙 검증    → 포인트가 안 나간다
//
// 화면이 비는 것은 바로 보인다. 포인트가 조용히 안 나가는 쪽은 아무도 모른다.
//
// 런타임 공유는 불가능하다 — 브라우저는 ESM, Functions 는 CommonJS 이고, 호스팅은
// functions/** 를 안 내보내며, 배포되는 functions/ 는 ../ 를 못 읽고, 번들러도 없다.
// 그래서 js/media-hosts.js 를 정본으로 두고 **이 시험이 나머지 둘을 지킨다.**

const CANON = readRepoFile('js/media-hosts.js');
const SECURITY = readRepoFile('js/security.js');
const POINTS = readRepoFile('functions/points-utils.js');
const FIREBASE_JSON = readRepoFile('firebase.json');

/** 정본에서 호스트 목록을 읽는다. 시험이 스스로 목록을 적어 두면 네 번째 사본이 된다. */
function canonicalHosts() {
    const block = CANON.split('export const MEDIA_HOSTS = Object.freeze([')[1].split(']')[0];
    const hosts = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(hosts.length, '정본에 호스트가 하나도 없다').toBeGreaterThan(0);
    return hosts;
}

function cspDirective(name) {
    const csp = JSON.parse(FIREBASE_JSON).hosting
        .flatMap((entry) => entry.headers || [])
        .flatMap((header) => header.headers || [])
        .find((header) => header.key === 'Content-Security-Policy');
    expect(csp, 'CSP 헤더를 찾지 못했다').toBeTruthy();
    const directive = csp.value.split(';').map((part) => part.trim())
        .find((part) => part.startsWith(`${name} `));
    expect(directive, `${name} 지시어가 없다`).toBeTruthy();
    return directive;
}

describe('there is one place that decides where member media lives', () => {
    const hosts = canonicalHosts();

    it('lets the browser check import the list instead of restating it', () => {
        expect(SECURITY).toContain("from './media-hosts.js");
        expect(SECURITY).toContain('isMediaHostUrl(url)');
        expect(SECURITY).toContain('isMediaEmulatorUrl(url)');
        // 정규식을 다시 적어 두면 정본이 둘이 된다.
        expect(SECURITY).not.toContain('firebasestorage');
        expect(SECURITY).not.toContain('127.0.0.1');
    });

    it('keeps the server list identical to the canonical one', () => {
        // functions/ 는 정본을 읽을 수 없다(배포 시 ../ 가 없다). 그래서 여기서 대조한다.
        const block = POINTS.split('const MEDIA_HOSTS = [')[1].split(']')[0];
        const serverHosts = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
        expect(serverHosts, 'functions/points-utils.js 의 MEDIA_HOSTS 가 js/media-hosts.js 와 다르다')
            .toEqual(hosts);
        // 그리고 실제로 그 목록을 쓰는지 — 이름만 두고 다른 걸 비교하면 소용없다.
        expect(POINTS).toContain('!MEDIA_HOSTS.includes(parsed.hostname)');
        expect(POINTS).not.toContain("parsed.hostname !== 'firebasestorage.googleapis.com'");
    });

    it('lets the browser load an image from every canonical host', () => {
        const imgSrc = cspDirective('img-src');
        for (const host of hosts) {
            expect(imgSrc, `img-src 에 ${host} 가 없다 — 사진이 안 보인다`).toContain(`https://${host}`);
        }
    });

    it('lets the browser play media from every canonical host', () => {
        const mediaSrc = cspDirective('media-src');
        for (const host of hosts) {
            expect(mediaSrc, `media-src 에 ${host} 가 없다 — 영상이 안 나온다`).toContain(`https://${host}`);
        }
    });

    it('does not put the emulator hosts into the shipped policy', () => {
        // 개발용 호스트가 운영 CSP 에 실릴 이유가 없다.
        const emulator = CANON.split('export const MEDIA_EMULATOR_HOSTS = Object.freeze([')[1].split(']')[0];
        const emulatorHosts = [...emulator.matchAll(/'([^']+)'/g)].map((m) => m[1]);
        expect(emulatorHosts).toContain('localhost');
        const imgSrc = cspDirective('img-src');
        for (const host of emulatorHosts) {
            expect(imgSrc).not.toContain(`https://${host}`);
        }
    });

    it('says in the canonical file why the other two cannot just import it', () => {
        // 다음 사람이 "왜 세 군데야" 하고 되돌리지 않도록 이유를 남긴다.
        expect(CANON).toContain('CommonJS');
        expect(CANON).toContain('functions/** 를 내보내지 않는다');
        expect(CANON).toContain('tests/media-host-single-source.test.js');
    });

    it('ships the new module to the browser and the cache', () => {
        // 새 파일은 서비스 워커 목록에 넣어야 오프라인에서 살아남는다.
        const sw = readRepoFile('sw.js');
        const version = sw.match(/habitschool-v(\d+)/)[1];
        expect(sw).toContain(`'./js/media-hosts.js?v=${version}'`);
        expect(SECURITY).toContain(`from './media-hosts.js?v=${version}'`);
    });
});

describe('the canonical check behaves the way the three places need', () => {
    function loadCanon() {
        const body = CANON.split('\n').filter((line) => !line.startsWith('import ')).join('\n')
            .split('export ').join('');
        return Function(`${body}
            return { isMediaHostUrl, isMediaEmulatorUrl, MEDIA_HOSTS };`)();
    }

    const api = loadCanon();

    it('accepts a real download url', () => {
        expect(api.isMediaHostUrl('https://firebasestorage.googleapis.com/v0/b/b/o/x?alt=media')).toBe(true);
    });

    it('refuses a host that merely ends with the allowed one', () => {
        // evil-firebasestorage.googleapis.com.attacker.test 같은 것이 통과하면 안 된다.
        expect(api.isMediaHostUrl('https://firebasestorage.googleapis.com.attacker.test/x')).toBe(false);
        expect(api.isMediaHostUrl('https://evilfirebasestorage.googleapis.com/x')).toBe(false);
    });

    it('refuses plain http and other schemes', () => {
        expect(api.isMediaHostUrl('http://firebasestorage.googleapis.com/x')).toBe(false);
        expect(api.isMediaHostUrl('data:image/png;base64,AAA')).toBe(false);
    });

    it('accepts the emulator only in its download shape', () => {
        expect(api.isMediaEmulatorUrl('http://127.0.0.1:9199/v0/b/bucket/o/file')).toBe(true);
        expect(api.isMediaEmulatorUrl('http://localhost/v0/b/bucket/o/file')).toBe(true);
        expect(api.isMediaEmulatorUrl('http://127.0.0.1:9199/whatever')).toBe(false);
    });

    it('survives being handed nothing', () => {
        expect(api.isMediaHostUrl(null)).toBe(false);
        expect(api.isMediaEmulatorUrl(undefined)).toBe(false);
    });
});
