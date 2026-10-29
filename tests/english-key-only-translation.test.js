import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { EN_MESSAGES } from '../js/i18n-en.js';
import { KO_MESSAGES } from '../js/i18n-ko.js';
import { readRawRepoFile } from './source-helpers.js';

// 해외 3단계 E6-4 (2026-10-28): 바꿔치기 장치를 지웠다.
// 예전에는 js/i18n.js 에 선택자 → 영어(SELECTOR_TEXTS 67·_ALL 7·_ATTRS 55)와 한국어 문장 → 영어(30쌍) 표가 있어,
// 화면이 바뀔 때마다 그 표대로 덮어썼다. 키가 없어 세 번째 언어를 넣을 수 없었고, 코드가 쓴 영어
// (AI 분석 단추의 "View analysis", 가이드 상태 문구)까지 고정 문장으로 덮어썼다.
// 이제 모두 index.html 의 data-i18n* 키다. 영어 첫 화면(en/index.html)은 빌드 때 영어로 온다.
const require = createRequire(import.meta.url);
const { I18N_ATTRIBUTES: BUILD_ATTRIBUTES } = require('../scripts/generate-en-entry.js');

const I18N = readRawRepoFile('js/i18n.js');
const KO_INDEX = readRawRepoFile('index.html');
const EN_INDEX = readRawRepoFile('en/index.html');
const HANGUL = /[가-힣]/;

function tagWith(html, marker) {
    const at = html.indexOf(marker);
    expect(at, marker).toBeGreaterThan(-1);
    return html.slice(html.lastIndexOf('<', at), html.indexOf('>', at) + 1);
}

describe('바꿔치기 장치가 없다', () => {
    it('선택자 표·문장 표·문장 바꿔치기 함수가 사라졌다', () => {
        for (const name of ['SELECTOR_TEXTS', 'SELECTOR_ATTRS', 'ENGLISH_TEXT_REPLACEMENTS', 'replaceExactTextNodes', 'translateText', 'function setText', 'function setAttr']) {
            expect(I18N, name).not.toContain(name);
        }
        expect(readRawRepoFile('js/ui-helpers.js')).not.toContain('translateText');
        expect(readRawRepoFile('js/app-core.js')).not.toContain('translateText');
    });

    it('속성 키 목록이 앱과 빌드에서 같다', () => {
        const list = I18N.split('export const I18N_ATTRIBUTES = [')[1].split('\n];')[0];
        const app = [...list.matchAll(/\['([\w-]+)', '([\w-]+)'\]/g)].map((m) => [m[1], m[2]]);
        expect(app).toEqual(BUILD_ATTRIBUTES);
        expect(app.map(([, attr]) => attr)).toEqual(['placeholder', 'aria-label', 'alt', 'title', 'href']);
    });

    it('같은 글자를 다시 넣지 않는다 (화면 감시가 쓸데없이 다시 깨지 않게)', () => {
        expect(I18N).toContain('if (el.textContent !== value) el.textContent = value;');
    });
});

describe('표가 맡던 영어가 영어 첫 화면에 그대로 있다', () => {
    const cases = [
        ['id="loginBtn"', 'aria-label="Sign in with Google"'],
        ['data-i18n="login.googleStart"', '>Start with Google<'],
        ['alt="Habit School logo"', 'alt="Habit School logo"'],
        ['data-i18n="login.terms"', 'href="/en/terms"'],
        ['data-i18n="login.privacy"', 'href="/en/privacy"'],
        ['data-i18n="profile.terms"', 'href="/en/terms"'],
        ['data-i18n="assets.wallet.tokenomics"', 'href="/en/tokenomics"'],
        ['onclick="copyWalletAddress()"', 'title="Copy address"'],
        ['id="weight"', 'placeholder="Weight (kg)"'],
        ['id="step-manual-input"', 'placeholder="Enter manually"'],
        ['id="preview-breakfast"', 'alt="Meal 1 preview"'],
        ['id="rm-sleep"', 'aria-label="Remove sleep screenshot"'],
        ['data-record-guide="sleep"', 'aria-label="Mind &amp; sleep logging guide"'],
        ['id="bug-report-fab"', 'aria-label="Report a bug"'],
    ];
    it.each(cases)('%s → %s', (marker, expected) => {
        const at = EN_INDEX.indexOf(marker);
        expect(at, marker).toBeGreaterThan(-1);
        const near = EN_INDEX.slice(EN_INDEX.lastIndexOf('<', at), EN_INDEX.indexOf('</', at) + 2);
        expect(near).toContain(expected);
    });

    // 퀘스트 판·공복 그래프·명상 글·Health Connect 단추는 E6-5 나(2026-10-29)에서 키를 달아 이제 함께 본다.
    // 사용법 ⓘ 단추는 영어 앱에서 통째로 숨긴다(js/guide-help.js initGuideHelp).
    it('기록 세 탭의 글자와 보이는 속성에 한글이 없다 (한국어 사용법 안내 단추는 빼고)', () => {
        const korean = [];
        for (const [from, to] of [['<div id="diet"', '<div id="exercise"'], ['<div id="exercise"', '<div id="sleep"'], ['<div id="sleep"', '<div id="gallery"']]) {
            const part = EN_INDEX.slice(EN_INDEX.indexOf(from), EN_INDEX.indexOf(to))
                .replace(/<!--[\s\S]*?-->/g, '')
                .replace(/<span class="guide-help-btn"[^>]*>/g, '');
            for (const m of part.matchAll(/\s(?:placeholder|aria-label|alt|title)="([^"]*)"/g)) if (HANGUL.test(m[1])) korean.push(m[1]);
            for (const piece of part.replace(/<[^>]*>/g, '\n').split('\n')) if (HANGUL.test(piece)) korean.push(piece.trim());
        }
        expect(korean).toEqual([]);
    });

    it('코드가 나중에 바꾸는 칸은 처음 글자만 빌드에서 넣는다 (화면 감시가 코드가 쓴 글을 덮어쓰지 않게)', () => {
        for (const id of ['diet-guide-status', 'exercise-guide-status', 'mind-guide-status', 'ai-btn-breakfast', 'ai-btn-sleep', 'quest-exercise', 'gratitude-voice-btn', 'meditation-start-btn', 'diet-guide-toggle']) {
            const tag = tagWith(KO_INDEX, `id="${id}"`);
            expect(tag, id).toContain('data-i18n-initial=');
            expect(tag, id).not.toMatch(/\sdata-i18n="/);
        }
    });

    it('키마다 영어가 있고 한글이 없다', () => {
        const keys = [...KO_INDEX.matchAll(/\sdata-i18n(?:-html|-placeholder|-aria-label|-alt|-title|-href|-initial|-initial-html)?="([^"]+)"/g)].map((m) => m[1]);
        for (const key of new Set(keys)) {
            expect(EN_MESSAGES[key], key).toBeTruthy();
        }
    });
});

describe('한국어는 그대로다', () => {
    it('코드에서 쓰던 한국어는 사전에 글자 그대로 옮겼다', () => {
        expect(KO_MESSAGES['quest.notYet']).toBe('미달성');
        expect(KO_MESSAGES['common.removeX']).toBe('X 삭제');
        const app = readRawRepoFile('js/app-core.js');
        expect(app).not.toContain("innerText = '미달성'");
        expect(app).toContain("'txt_c_${id}')\">${t('common.removeX')}</button>");
    });

    it('구글 단추는 글자만 감쌌다 (한국어 글자는 같다)', () => {
        expect(KO_INDEX).toContain('<span data-i18n="login.googleStart">구글로 시작하기</span>');
    });

    it('토스트는 받은 글을 그대로 띄운다', () => {
        const toast = readRawRepoFile('js/ui-helpers.js').split('export function showToast(')[1].split('\n}\n')[0];
        expect(toast).toContain('toast.innerText = message;');
    });
});
