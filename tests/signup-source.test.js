import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

const DETECT = readRepoFile('js/browser-detect.js');
const detectGlobal = {};
Function('window', 'globalThis', DETECT)(detectGlobal, detectGlobal);
import { classifySignupSource } from '../scripts/signup-sources.mjs';

// 2026-09-27: 가입 기록에 남는 출처가 초대자 하나뿐이라, 어느 채널이 사람을
// 데려오는지 알 수 없었다. 첫 방문 기록을 가입 때 settings.signupSource 로 옮긴다.

const AUTH = readRepoFile('js/auth.js');
const RUNTIME = readRepoFile('functions/runtime.js');

function loadFirstTouch() {
    const grab = (name) => {
        const s = AUTH.indexOf(`function ${name}(`);
        return AUTH.slice(s, AUTH.indexOf('\n}\n', s) + 2);
    };
    return Function('normalizeInviteRefCode', 'window', 'navigator', `
        ${grab('detectInAppSource')}
        ${grab('buildFirstTouch')}
        return { detectInAppSource, buildFirstTouch };
    `)((c) => (/^[A-Z0-9]{6}$/.test(String(c || '').toUpperCase()) ? String(c).toUpperCase() : ''), detectGlobal, {});
}

const loc = (url) => { const u = new URL(url); return { search: u.search, pathname: u.pathname, hostname: u.hostname }; };

describe('first visit record', () => {
    const { detectInAppSource, buildFirstTouch } = loadFirstTouch();

    it('keeps the channel tag the invite link passed along', () => {
        const r = buildFirstTouch(loc('https://habitschool.web.app/?ref=7e8hf9&src=tiktok'), '', 'Mozilla/5.0');
        expect(r).toMatchObject({ src: 'tiktok', ref: '7E8HF9', path: '/' });
    });

    it('reads utm tags and the site the person came from', () => {
        const r = buildFirstTouch(loc('https://habitschool.web.app/?utm_source=naver&utm_medium=blog&utm_campaign=v450'), 'https://blog.naver.com/csj3814/1', 'Mozilla/5.0');
        expect(r).toMatchObject({ src: 'naver', medium: 'blog', campaign: 'v450', referrer: 'blog.naver.com' });
    });

    it('ignores its own site as the previous page and drops empty fields', () => {
        const r = buildFirstTouch(loc('https://habitschool.web.app/'), 'https://habitschool.web.app/en', 'Mozilla/5.0');
        expect(r.referrer).toBeUndefined();
        expect(Object.keys(r).sort()).toEqual(['at', 'path']);
    });

    it('never keeps free text from the address', () => {
        const r = buildFirstTouch(loc('https://habitschool.web.app/?src=%3Cscript%3Ealert(1)%3C/script%3E%ED%99%8D%EA%B8%B8%EB%8F%99'), '', '');
        expect(r.src).toMatch(/^[a-z0-9._:/-]*$/);
        expect(r.src.length).toBeLessThanOrEqual(20);
    });

    it('recognises the in-app browsers people tap links in', () => {
        expect(detectInAppSource('Mozilla/5.0 (Linux; Android 14) KAKAOTALK 10.8.0')).toBe('kakaotalk');
        expect(detectInAppSource('Mozilla/5.0 (iPhone) Instagram 300.0')).toBe('instagram');
        expect(detectInAppSource('Mozilla/5.0 (Linux; Android 14; wv) Barcelona 350.0')).toBe('threads');
        expect(detectInAppSource('Mozilla/5.0 [FBAN/FBIOS;FBAV/450.0]')).toBe('facebook');
        expect(detectInAppSource('Mozilla/5.0 (Linux; Android 14; wv) musical_ly_2023')).toBe('tiktok');
        expect(detectInAppSource('Mozilla/5.0 (Linux; Android 14) Chrome/140 Mobile Safari')).toBe('');
    });

    it('moves the record into the member document at signup', () => {
        expect(AUTH).toContain('signupSource: readFirstTouch() || { ...buildFirstTouch(), late: true }');
        expect(AUTH).toContain('rememberFirstTouch();');
    });

    it('carries the ?s= tag through the invite link redirect', () => {
        expect(RUNTIME).toContain('const sourceTag = String(req.query?.s || "")');
        expect(RUNTIME).toContain('&src=${sourceTag}');
    });
});

describe('signup source report', () => {
    it('names the channel from the tag, the in-app browser, then the previous site', () => {
        expect(classifySignupSource({ src: 'tiktok', app: 'kakaotalk' })).toBe('tiktok');
        expect(classifySignupSource({ app: 'instagram' })).toBe('instagram');
        expect(classifySignupSource({ referrer: 'm.youtube.com' })).toBe('youtube');
        expect(classifySignupSource({ referrer: 'brunch.co.kr' })).toBe('brunch');
        expect(classifySignupSource({ ref: '7E8HF9' })).toBe('invite');
        expect(classifySignupSource(undefined, true)).toBe('invite');
        expect(classifySignupSource(undefined, false)).toBe('(기록 없음)');
        expect(classifySignupSource({ path: '/' })).toBe('직접·앱');
    });
});
