// 플레이 앱을 한국어가 아닌 기기에 깔면 첫 화면이 영어 앱(/en)으로 열린다 (해외 3단계 E1, 2026-10-21 대표 결정
// "첫 화면 언어는 기기 언어로 자동"). 안드로이드 앱(AAB)의 시작 주소는 /app 그대로 두고, 웹 머리 스크립트가 옮긴다.
// 한국어 회원 쪽 경우는 tests/korean-app-unchanged-i18n.test.js 에 있다.

import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';
import { runHead, TWA_REFERRER } from './head-script-harness.mjs';

const CHOICE_KEY = 'habitschool-locale-choice-v1';
const SIGNED_IN_HINT = 'habitschool-signed-in-hint-v1';

describe('플레이 앱 /app — 기기 언어가 한국어가 아니면 처음 한 번 영어 앱으로', () => {
    it.each([['en-US'], ['en-GB'], ['ja-JP'], ['es-419']])('%s 기기 → /en, 고른 언어로 기억', (language) => {
        const result = runHead({ path: '/app', referrer: TWA_REFERRER, languages: [language] });
        expect(result.replaced).toEqual(['/en']);
        expect(result.local[CHOICE_KEY]).toBe('en');
        // 옮기기 전에 플레이 잠금 표시가 먼저 적혀 있어야 /en 에서도 HBT 가 숨는다.
        expect(result.session.hs_play_context).toBe('1');
        expect(result.classes).toContain('play-mode');
        // 옮기는 동안 한국어 화면이 비치지 않게 가린다.
        expect(result.classes).toContain('locale-redirecting');
    });

    it('검색어와 해시를 그대로 가져간다', () => {
        const result = runHead({ path: '/app', search: '?ref=AB12', hash: '#diet', referrer: TWA_REFERRER, languages: ['en-US'] });
        expect(result.replaced).toEqual(['/en?ref=AB12#diet']);
    });

    it('navigator.languages 가 비어 있으면 navigator.language 를 본다', () => {
        const result = runHead({ path: '/app', referrer: TWA_REFERRER, languages: [] , language: 'fr-FR' });
        expect(result.replaced).toEqual(['/en']);
    });

    it('기기 언어를 모르면 옮기지 않는다', () => {
        const result = runHead({ path: '/app', referrer: TWA_REFERRER, languages: [], language: '' });
        expect(result.replaced).toEqual([]);
        expect(result.classes).not.toContain('locale-redirecting');
    });

    it('한국어(ko, ko-KR)를 고른 적이 있으면 옮기지 않는다', () => {
        const result = runHead({ path: '/app', referrer: TWA_REFERRER, languages: ['en-US'], local: { [CHOICE_KEY]: 'ko' } });
        expect(result.replaced).toEqual([]);
    });

    it('영어를 고른 적이 있으면 로그인했던 표시가 있어도 영어 앱으로', () => {
        // 영어 앱에서 로그인하면 표시가 생긴다. 그 회원이 다음에 앱을 열 때 한국어로 돌아가면 안 된다.
        const result = runHead({
            path: '/app', referrer: TWA_REFERRER, languages: ['en-US'],
            local: { [CHOICE_KEY]: 'en', [SIGNED_IN_HINT]: JSON.stringify({ at: Date.now() }) },
        });
        expect(result.replaced).toEqual(['/en']);
    });

    it('로그인했던 표시가 오래돼도(60일 지남) 이 기기의 한국어 회원으로 보고 옮기지 않는다', () => {
        const result = runHead({
            path: '/app', referrer: TWA_REFERRER, languages: ['en-US'],
            local: { [SIGNED_IN_HINT]: JSON.stringify({ at: Date.now() - 90 * 86400000 }) },
        });
        expect(result.replaced).toEqual([]);
    });

    it('로그인 표시가 생기기 전(v523 이전)부터 쓰던 회원도 자산 캐시로 알아보고 옮기지 않는다', () => {
        const result = runHead({
            path: '/app', referrer: TWA_REFERRER, languages: ['en-US'],
            local: { hs_wallet_abc123: JSON.stringify({ ts: Date.now() - 200 * 86400000, coins: 900 }) },
        });
        expect(result.replaced).toEqual([]);
    });
});

describe('플레이 앱 / (공유·직접 열기·위젯·헬스커넥트·알림)', () => {
    const share = { path: '/', search: '?tab=diet&native=android-share&focus=shared-upload&sharedUploads=a1,b2', hash: '#diet' };

    it('영어를 고른 회원의 공유는 영어 앱으로, 검색어 그대로', () => {
        const result = runHead({ ...share, languages: ['en-US'], session: { hs_play_context: '1' }, local: { [CHOICE_KEY]: 'en' } });
        expect(result.replaced).toEqual([`/en${share.search}${share.hash}`]);
    });

    it('고른 적이 없으면 공유는 한국어 그대로 (기기 언어로 정하는 것은 /app 처음 열 때뿐)', () => {
        const result = runHead({ ...share, languages: ['en-US'], session: { hs_play_context: '1' } });
        expect(result.replaced).toEqual([]);
    });

    // 2026-10-24 제보(대표): "삼성헬스에서 공유하기로 들어가면 영어앱으로 나오고 앱 직접 열어 들어가면 한글앱으로 나와".
    // 공유만 고른 언어를 따르고 다른 / 진입은 따르지 않았다. 영어 앱에 모든 화면이 열렸으니 모두 같은 기억을 따른다.
    it('영어를 고른 회원은 공유가 아닌 / 진입(직접 열기·위젯·헬스커넥트·알림)도 영어 앱으로, 검색어 그대로', () => {
        for (const search of ['?native=android-shell', '?tab=exercise&native=android-shell&focus=health-connect-steps&stepCount=10', '?tab=profile&panel=friends&friendshipId=x', '']) {
            const result = runHead({ path: '/', search, languages: ['ko-KR'], session: { hs_play_context: '1' }, local: { [CHOICE_KEY]: 'en' } });
            expect(result.replaced, search).toEqual([`/en${search}`]);
        }
    });

    it('한국어를 골랐거나 고른 적이 없으면 / 진입은 한국어 그대로 (영어 기기여도)', () => {
        for (const local of [{ [CHOICE_KEY]: 'ko' }, {}]) {
            for (const search of ['?native=android-shell', '?tab=diet&focus=shared-upload', '']) {
                const result = runHead({ path: '/', search, languages: ['en-US'], session: { hs_play_context: '1' }, local });
                expect(result.replaced, `${JSON.stringify(local)} ${search}`).toEqual([]);
            }
        }
    });
});

describe('플레이 앱이 아니면 아무 데도 옮기지 않는다', () => {
    it('웹 크롬에서 / 를 열면 영어를 골랐어도 한국어 그대로', () => {
        const result = runHead({ path: '/', search: '?focus=shared-upload', languages: ['en-US'], local: { [CHOICE_KEY]: 'en' } });
        expect(result.replaced).toEqual([]);
    });

    it('영어 앱(/en) 자신은 옮기지 않는다', () => {
        for (const file of ['index.html', 'en/index.html']) {
            const result = runHead({ file, path: '/en', referrer: TWA_REFERRER, languages: ['en-US'], local: { [CHOICE_KEY]: 'en' } });
            expect(result.replaced, file).toEqual([]);
            expect(result.classes, file).toContain('locale-en');
            expect(result.classes, file).toContain('play-mode');
        }
    });

    it('저장소가 막혀 있어도 첫 화면이 멈추지 않는다', () => {
        const result = runHead({ path: '/app', referrer: TWA_REFERRER, languages: ['en-US'], storageThrows: true });
        expect(result.classes).toContain('play-mode');
    });
});

describe('언어를 고르면 기억한다', () => {
    const appMode = readRepoFile('js/app-mode.js');
    const core = readRepoFile('js/app-core.js');
    const auth = readRepoFile('js/auth.js');
    const index = readRepoFile('index.html');

    it('머리 스크립트와 앱이 같은 이름으로 읽고 쓴다', () => {
        expect(index).toContain(`'${CHOICE_KEY}'`);
        expect(appMode).toContain(`'${CHOICE_KEY}'`);
        expect(appMode).toMatch(/export function rememberLocaleChoice\(/);
    });

    it('버전 고르기(로그인 화면·프로필)와 영어 프로필의 언어 단추가 기억한다', () => {
        const switchVersion = core.slice(core.indexOf('window.switchAppVersion = function'), core.indexOf('function renderVersionSwitchers'));
        expect(switchVersion).toContain("rememberLocaleChoice(version === 'en' ? 'en' : 'ko')");
        const switchLocale = auth.slice(auth.indexOf('window.switchHabitSchoolLocale = function'), auth.indexOf('function parseCachedPointNumber'));
        expect(switchLocale).toContain('rememberLocaleChoice(nextLocale)');
        // 영어 화면 머리글의 "한국어" 단추(#simple-mode-default-btn) — 로그인 전에도 보이는 유일한 한국어 단추다.
        const toDefault = core.slice(core.indexOf('function switchToDefaultMode() {'), core.indexOf('// 페이지 종료 시 리소스 정리'));
        expect(toDefault).toContain("rememberLocaleChoice('ko');");
        expect(index).toMatch(/id="simple-mode-default-btn"[^>]*onclick="switchToDefaultMode\(\)"|onclick="switchToDefaultMode\(\)"[^>]*id="simple-mode-default-btn"/);
    });
});

describe('영어 로그인 화면에서 한국어로 돌아가는 길', () => {
    const index = readRepoFile('index.html');
    const enIndex = readRepoFile('en/index.html');
    const base = readRepoFile('styles-base.css');

    it('약관 링크 옆에 "한국어" 단추가 있고, 누르면 한국어 앱으로 가며 기억한다', () => {
        expect(enIndex).toMatch(/class="login-locale-switch-btn"[^>]*data-i18n="login\.switchToKorean"[^>]*onclick="window\.switchHabitSchoolLocale\?\.\('ko'\)">한국어<\/button>/);
    });

    it('한국어 화면에서는 숨는다 (한국어 앱 화면은 그대로)', () => {
        expect(base).toMatch(/\.login-locale-switch \{ display: none; \}/);
        expect(base).toMatch(/html\.locale-en \.login-locale-switch \{ display: inline; \}/);
        // 한국어 index.html 의 자리 글자에는 한글이 없어 한국어 글자 기준 파일이 바뀌지 않는다.
        expect(index).toContain('data-i18n="login.switchToKorean" onclick="window.switchHabitSchoolLocale?.(\'ko\')">Korean</button>');
    });
});
