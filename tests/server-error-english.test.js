import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readRawRepoFile } from './source-helpers.js';

// 해외 3단계 E6-2 (2026-10-23): 서버 오류 문장을 회원 언어로.
// 서버는 한국어 message 를 그대로 두고 details.en 에 영어를 싣는다(functions/error-messages.js).
// 화면은 js/i18n.js serverErrorText 로 고른다. 영어 화면에 서버 한국어가 나가지 않는다.
// 서버 파일과 같은 자리에서 찾게 한다(firebase-functions 는 functions/node_modules 에 있다).
const require = createRequire(new URL('../functions/index.js', import.meta.url));
const { HttpsError } = require('firebase-functions/v2/https');
const messages = require('./error-messages.js');

const HANGUL = /[가-힣]/;
const FILES = ['functions/runtime.js', 'functions/reward-market.js', 'functions/account-deletion.js',
    'functions/global-rewards.js', 'functions/shared-upload.js', 'functions/bug-report-fallback.js'];
const STR = '(`(?:[^`\\\\]|\\\\.)*`|"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\')';
const THROW = new RegExp(`new HttpsError\\(\\s*"[\\w-]+",\\s*(?:[\\w.]+ \\|\\| )?${STR}`, 'g');

// 관리자 전용 함수(앞부분에서 admins/ 를 확인)의 오류는 관제탑만 본다. 회원 화면으로 가지 않는다.
function adminRanges(source) {
    const ranges = [];
    const re = /\nexports\.(\w+)\s*=/g;
    let m;
    while ((m = re.exec(source))) {
        const next = source.indexOf('\nexports.', m.index + 1);
        const end = next === -1 ? source.length : next;
        if (source.slice(m.index, m.index + 1500).includes('admins/')) ranges.push([m.index, end]);
    }
    return ranges;
}

function memberFacingKoreanMessages() {
    const out = [];
    for (const file of FILES) {
        const source = readRawRepoFile(file);
        const admin = adminRanges(source);
        for (const m of source.matchAll(THROW)) {
            const literal = m[1];
            if (!HANGUL.test(literal)) continue;
            if (admin.some(([a, b]) => m.index >= a && m.index < b)) continue;
            // 실제로 나갈 모양으로 만든다. ${…} 자리는 숫자로 채운다.
            const text = literal.slice(1, -1).replace(/\$\{[^}]*\}/g, '1,000');
            out.push({ file, text });
        }
    }
    return out;
}

describe('회원에게 가는 서버 오류 문장마다 영어가 있다', () => {
    const list = memberFacingKoreanMessages();

    it('오류 문장을 빠짐없이 모았다', () => {
        expect(list.length).toBeGreaterThan(300);
    });

    it('모든 한국어 오류 문장에 영어가 있다 (서버에 새 문장을 쓰면 functions/error-messages.js 에도 단다)', () => {
        const missing = [...new Set(list.filter(({ text }) => !messages.englishForErrorMessage(text)).map(({ file, text }) => `${file}: ${text}`))];
        expect(missing).toEqual([]);
    });

    it('영어에는 한글이 없다', () => {
        for (const [ko, en] of messages.EXACT) expect(HANGUL.test(en), ko).toBe(false);
        for (const { text } of list) expect(HANGUL.test(messages.englishForErrorMessage(text)), text).toBe(false);
    });

    it('숫자가 낀 문장은 숫자를 그대로 옮긴다', () => {
        expect(messages.englishForErrorMessage('포인트가 부족합니다. 필요: 1,200P, 보유: 300P')).toBe('Not enough points. Needed: 1,200P, you have: 300P');
        expect(messages.englishForErrorMessage('챌린지 참가는 최근 30일 내 7일 이상 기록이 필요합니다.')).toBe('To join a challenge, you need logs on at least 7 of the last 30 days.');
        expect(messages.englishForErrorMessage('포인트가 부족해요. 현재 2,500P예요.')).toBe('Not enough points. You have 2,500P.');
    });
});

describe('서버 입구가 오류에 영어를 싣는다', () => {
    it('한국어 message 와 code 는 그대로, details 에 en 을 더한다', () => {
        const out = messages.withErrorTranslations(new HttpsError('failed-precondition', '포인트가 모자라요.', { reason: 'insufficient-points' }));
        expect(out).toBeInstanceOf(HttpsError);
        expect(out.code).toBe('failed-precondition');
        expect(out.message).toBe('포인트가 모자라요.');
        expect(out.details).toEqual({ reason: 'insufficient-points', en: 'Not enough points.' });
    });

    it('영어가 없는 문장·한국어 아닌 문장·HttpsError 아닌 오류는 건드리지 않는다', () => {
        const unknown = new HttpsError('internal', '처음 보는 문장');
        expect(messages.withErrorTranslations(unknown)).toBe(unknown);
        const plain = new Error('로그인 필요');
        expect(messages.withErrorTranslations(plain)).toBe(plain);
        const english = new HttpsError('internal', 'internal');
        expect(messages.withErrorTranslations(english)).toBe(english);
    });

    it('감싼 처리 함수가 던진 오류를 바꿔 던진다', async () => {
        const handler = messages.localizeCallable(async () => { throw new HttpsError('unauthenticated', '로그인 필요'); });
        await expect(handler({})).rejects.toMatchObject({ message: '로그인 필요', details: { en: 'Please sign in.' } });
        const ok = messages.localizeCallable(async () => 42);
        expect(await ok({})).toBe(42);
    });

    it('콜러블을 만드는 네 파일 모두 감싼 onCall 을 쓴다', () => {
        for (const file of ['functions/runtime.js', 'functions/account-deletion.js', 'functions/shared-upload.js', 'functions/bug-report-fallback.js']) {
            const source = readRawRepoFile(file);
            expect(source, file).toContain('{ onCall: baseOnCall,');
            expect(source, file).toContain('const onCall = localizedOnCall(baseOnCall);');
        }
        for (const file of ['functions/reward-market.js', 'functions/global-rewards.js']) {
            expect(readRawRepoFile(file), file).not.toMatch(/\bonCall\(/);
        }
    });
});

describe('화면은 언어를 보고 고른다', async () => {
    vi.stubGlobal('window', { location: { pathname: '/en', search: '' }, localStorage: { getItem: () => null, setItem() {} } });
    const i18n = await import('../js/i18n.js');
    const error = { code: 'functions/failed-precondition', message: '포인트가 모자라요.', details: { en: 'Not enough points.' } };

    it('한국어 화면은 예전처럼 서버 message 그대로', () => {
        const fn = readRawRepoFile('js/i18n.js').split('export function serverErrorText(error, fallback = \'\') {')[1].split('\n}\n')[0];
        expect(fn).toContain("if (locale === 'ko') return message || fallback;");
    });

    it('영어 화면은 details.en, 없으면 한글 없는 message, 그것도 없으면 기본 문장', () => {
        expect(i18n.getLocale()).toBe('en');
        expect(i18n.serverErrorText(error, 'fallback')).toBe('Not enough points.');
        expect(i18n.serverErrorText({ message: '처음 보는 문장' }, 'fallback')).toBe('fallback');
        expect(i18n.serverErrorText({ message: 'internal' }, 'fallback')).toBe('fallback');
        expect(i18n.serverErrorText({ message: 'Quota exceeded' }, 'fallback')).toBe('Quota exceeded');
    });

    it('서버 오류를 띄우던 자리가 모두 도우미를 쓴다', () => {
        const app = readRawRepoFile('js/app-core.js');
        const market = readRawRepoFile('js/reward-market.js');
        const chain = readRawRepoFile('js/blockchain-manager.js');
        const claim = readRawRepoFile('js/challenge-claim.js');
        expect(market).not.toMatch(/error\?\.message \|\| t\('market\./);
        expect(chain).not.toContain("error.message || t('hbt.unknownError')");
        expect(chain).not.toContain("showToast(error?.message || t('hbt.redeem.failed'))");
        expect(claim).not.toContain("String(error?.message || '').trim()");
        expect(app).not.toMatch(/showToast\(`⚠️ \$\{(e|error)\.message \|\|/);
        expect(readRawRepoFile('js/auth.js')).toContain('serverErrorText(err, err)');
    });
});
