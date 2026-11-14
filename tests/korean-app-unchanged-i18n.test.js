// 해외 3단계(영어 앱을 전체 앱으로, 키 기반 번역)를 하는 동안 한국어 앱 화면은 하나도 바뀌지 않는다.
// 이 파일은 번역 코드보다 먼저 썼다(2026-10-21, 대표 지시 "그걸 증명하는 테스트를 먼저 써").
// 여기서 실패하면 한국어 회원이 보는 글자·주소·탭·첫 화면 중 무언가가 달라진 것이다.
//
// 기준 파일: tests/fixtures/korean-text-baseline.json (scripts/snapshot-korean-text.mjs 로 만든다).
// 한국어 문구를 일부러 고칠 때만 그 커밋 안에서 기준 파일을 다시 만든다.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildKoreanTextInventory, ROOT_DIR } from './korean-text-inventory.mjs';
import { getAllowedTabsForRoute, getRouteContext } from '../js/app-mode.js';
import { runHead, TWA_REFERRER } from './head-script-harness.mjs';

const baseline = JSON.parse(readFileSync(join(ROOT_DIR, 'tests', 'fixtures', 'korean-text-baseline.json'), 'utf8'));
const current = buildKoreanTextInventory();

function missingFrom(baselineList, currentList) {
    const have = new Set(currentList);
    return baselineList.filter((piece) => !have.has(piece));
}

describe('한국어 글자는 그대로 남는다', () => {
    it('index.html 의 한국어 글자(텍스트와 보이는 속성)가 순서까지 같다', () => {
        // data-i18n 같은 속성을 더하는 것은 괜찮다. 글자가 바뀌거나 빠지거나 늘면 실패한다.
        expect(current.indexHtml.length).toBe(baseline.indexHtml.length);
        expect(current.indexHtml).toEqual(baseline.indexHtml);
    });

    it('js/ 의 한국어 문장이 하나도 빠지지 않았다 (사전으로 옮기는 것은 괜찮다)', () => {
        expect(missingFrom(baseline.js, current.js)).toEqual([]);
    });

    it('functions/ 의 한국어 문장이 하나도 빠지지 않았다', () => {
        expect(missingFrom(baseline.functions, current.functions)).toEqual([]);
    });
});

describe('한국어 주소와 탭은 그대로다', () => {
    const DEFAULT_TABS = ['dashboard', 'diet', 'exercise', 'sleep', 'profile', 'gallery', 'assets'];
    const SIMPLE_TABS = ['diet', 'exercise', 'sleep', 'profile'];
    const base = {
        locale: 'ko', isEnglish: false, isEnglishLanding: false, isKoreanLanding: false,
    };
    const cases = [
        ['/', { ...base, path: '/', mode: 'default', isSimple: false, isPlay: false, defaultTab: 'dashboard', basePath: '/' }, DEFAULT_TABS],
        ['/simple', { ...base, path: '/simple', mode: 'simple', isSimple: true, isPlay: false, defaultTab: 'profile', basePath: '/simple' }, SIMPLE_TABS],
        ['/app', { ...base, path: '/app', mode: 'default', isSimple: false, isPlay: true, defaultTab: 'dashboard', basePath: '/app' }, DEFAULT_TABS],
        ['/app/index.html', { ...base, path: '/app/index.html', mode: 'default', isSimple: false, isPlay: true, defaultTab: 'dashboard', basePath: '/app' }, DEFAULT_TABS],
        ['/welcome', { ...base, path: '/welcome', isKoreanLanding: true, mode: 'default', isSimple: false, isPlay: false, defaultTab: 'dashboard', basePath: '/' }, DEFAULT_TABS],
    ];
    it.each(cases)('%s', (path, expected, tabs) => {
        const context = getRouteContext(path);
        expect(context).toEqual(expected);
        expect(getAllowedTabsForRoute(context)).toEqual(tabs);
    });
});

// ── 첫 화면 전에 도는 head 스크립트 ────────────────────────────────────────────
// 플레이 앱 첫 화면 언어(E1)는 이 스크립트에 들어간다. 아래 경우에는 지금처럼 아무 데도 옮기지 않아야 한다.


describe('첫 화면 전 판정 — 한국어 회원은 그대로', () => {
    // 2026-11-03: 이 기기에서 로그인한 적 없이 `/` 로 처음 온 사람은 소개 페이지를 본다(입구 합치기).
    // 로그인했던 회원은 아래 따로 본다 — 그대로 로그인·앱 화면이다.
    const webCases = [
        ['/', ['ko-landing', 'locale-ko']],
        ['/welcome', ['ko-landing', 'locale-ko']],
    ];
    // 2026-11-14: 한국어가 아닌 기기의 첫 방문은 / 에서 영어 소개 화면으로 간다(tests/play-first-screen-language.test.js).
    // 한국어 주소를 콕 집은 /welcome 은 기기 언어와 관계없이 그대로다.
    for (const languages of [['ko-KR'], ['en-US', 'en'], ['ja-JP']]) {
        const cases = languages[0].startsWith('ko') ? webCases : webCases.filter(([path]) => path !== '/');
        it.each(cases)(`웹 크롬 %s (기기 언어 ${languages[0]}) — 주소대로, 옮기지 않음`, (path, classes) => {
            const result = runHead({ path, languages });
            expect(result.replaced).toEqual([]);
            expect(result.classes).toEqual(classes);
            expect(result.playFlag).toBe(false);
        });
    }

    it('로그인했던 회원이 / 로 오면 소개 페이지 없이 지금 그대로다', () => {
        const result = runHead({ path: '/', local: { 'habitschool-signed-in-hint-v1': JSON.stringify({ at: Date.now() - 1000 }) } });
        expect(result.replaced).toEqual([]);
        expect(result.classes).toContain('locale-ko');
        expect(result.classes).not.toContain('ko-landing');
    });

    it('플레이 앱 /app, 한국어 기기 — 한국어 라이트 그대로', () => {
        const result = runHead({ path: '/app', referrer: TWA_REFERRER, languages: ['ko-KR'] });
        expect(result.replaced).toEqual([]);
        expect(result.classes).toEqual(['locale-ko', 'play-mode']);
        expect(result.session.hs_play_context).toBe('1');
        expect(result.playFlag).toBe(true);
    });

    it('플레이 앱 /app, 영어 기기라도 이 기기에서 로그인했던 회원이면 한국어 그대로', () => {
        const result = runHead({
            path: '/app',
            referrer: TWA_REFERRER,
            languages: ['en-US'],
            local: { 'habitschool-signed-in-hint-v1': JSON.stringify({ at: Date.now() - 86400000 }) },
        });
        expect(result.replaced).toEqual([]);
        expect(result.classes).toContain('locale-ko');
        expect(result.classes).toContain('play-mode');
    });

    it('플레이 앱 /, 공유로 들어옴(한국어 기기) — 한국어 그대로, 검색어 유지', () => {
        const result = runHead({
            path: '/', search: '?tab=diet&focus=shared-upload', hash: '#diet',
            languages: ['ko-KR'], session: { hs_play_context: '1' },
        });
        expect(result.replaced).toEqual([]);
        expect(result.classes).toEqual(['locale-ko', 'play-mode']);
    });

    // 2026-11-11: 심플형을 기본 앱으로 합쳤다. /simple 주소는 살아 있고, 쿼리·해시를 지닌 채 / 로 넘긴다.
    // 초대 QR 이 /simple?ref=코드 로 찍혀 나갔으므로 쿼리가 떨어지면 초대 보상이 끊긴다.
    it.each([
        ['/simple', '', '', '/'],
        ['/simple/', '', '', '/'],
        ['/simple', '?ref=ABC123', '#diet', '/?ref=ABC123#diet'],
        ['/simple', '?chatbotConnectToken=tok&ref=x', '', '/?chatbotConnectToken=tok&ref=x'],
    ])('웹 크롬 %s%s%s — 기본 앱 %s 로 넘긴다', (path, search, hash, target) => {
        for (const file of ['index.html', 'en/index.html']) {
            const result = runHead({ file, path, search, hash });
            expect(result.replaced).toEqual([target]);
            expect(result.classes).not.toContain('simple-mode');
            // 넘어가는 동안 화면을 가린다.
            expect(result.classes).toContain('locale-redirecting');
        }
    });

    it('플레이 앱 /simple, 영어 기기 — 기본 앱으로 한 번만 넘기고 플레이 잠금은 남는다', () => {
        const result = runHead({ path: '/simple', search: '?ref=x', languages: ['en-US'], session: { hs_play_context: '1' } });
        expect(result.replaced).toEqual(['/?ref=x']);
        expect(result.classes).toContain('play-mode');
        expect(result.classes).not.toContain('simple-mode');
        expect(result.session.hs_play_context).toBe('1');
    });
});
