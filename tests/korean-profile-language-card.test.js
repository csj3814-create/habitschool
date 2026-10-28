// 2026-10-28 대표: "영어앱처럼 한국어 앱에도 프로필탭 상단에 언어 변경할 수 있는 박스 넣자".
// 영어 앱 프로필 맨 위의 언어 카드를 한국어 앱(기본형·플레이 앱)에서도 보인다. 텔레그램 카드는 영어 앱에만.
// 심플 모드 프로필은 따로 만든 화면이라 그대로 둔다(심플에는 '기본형' 단추가 있다).

import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

const INDEX = readRepoFile('index.html');
const EN_INDEX = readRepoFile('en/index.html');
const AUTH = readRepoFile('js/auth.js');
const EN_CSS = readRepoFile('styles-en.css').replace(/\/\*[\s\S]*?\*\//g, '');
const BASE_CSS = readRepoFile('styles-base.css');

function languageCard(html) {
    const start = html.indexOf('<section class="english-profile-card profile-language-card"');
    expect(start, 'language card').toBeGreaterThan(-1);
    return html.slice(start, html.indexOf('</section>', start));
}

describe('한국어 앱 프로필 맨 위 언어 카드', () => {
    it('프로필에서 심플 전용 묶음 바로 다음, 다른 카드보다 위에 있다', () => {
        const profile = INDEX.slice(INDEX.indexOf('<div id="profile" class="content-section"'));
        const shell = profile.indexOf('id="english-profile-shell"');
        expect(shell).toBeGreaterThan(profile.indexOf('<div class="simple-profile-shell"'));
        expect(shell).toBeLessThan(profile.indexOf('<div class="card'));
        expect(shell).toBeLessThan(profile.indexOf('id="le8-score-container"'));
    });

    it('한국어 화면은 한국어로', () => {
        const card = languageCard(INDEX);
        expect(card).toContain('data-i18n="profile.language.kicker">언어</span>');
        expect(card).toContain('data-i18n="profile.language.current">한국어</strong>');
        expect(card).toContain('data-i18n="profile.language.desc">앱 화면 언어를 바꿀 수 있어요. 계정과 기록은 그대로 이어져요.</p>');
    });

    it('영어 화면 글자는 예전 그대로', () => {
        const card = languageCard(EN_INDEX);
        expect(card).toContain('>Language</span>');
        expect(card).toContain('>English</strong>');
        expect(card).toContain('>Switch between the English entry and the Korean app. Your account and records stay shared.</p>');
    });

    it('두 단추는 같은 언어 전환 함수를 부르고, 눌린 표시는 지금 언어를 따른다', () => {
        const card = languageCard(INDEX);
        expect(card).toContain(`data-locale-choice="en" onclick="window.switchHabitSchoolLocale?.('en')"`);
        expect(card).toContain(`data-locale-choice="ko" onclick="window.switchHabitSchoolLocale?.('ko')"`);
        const fn = AUTH.slice(AUTH.indexOf('function updateProfileLanguagePanel()'), AUTH.indexOf('window.switchHabitSchoolLocale = function'));
        expect(fn).not.toContain('if (!isEnglishLocale()) return;');
        expect(fn).toContain("button.setAttribute('aria-pressed', String(button.dataset.localeChoice === locale));");
        expect(AUTH).toContain('updateProfileLanguagePanel();');
        expect(AUTH).not.toContain('updateEnglishProfilePanel');
    });

    it('한국어에서도 카드 묶음이 보이고, 텔레그램 카드는 영어에서만', () => {
        expect(EN_CSS).not.toMatch(/\.english-profile-shell \{\s*display: none;/);
        expect(EN_CSS).toMatch(/html:not\(\.locale-en\) \.english-community-card \{\s*display: none;/);
        // 심플 모드는 프로필의 다른 칸을 모두 숨긴다 — 언어 카드도 여기 걸린다.
        expect(BASE_CSS).toContain('html.simple-mode #profile > :not(.simple-profile-shell)');
    });

    it('묶음 이름표도 언어를 따른다', () => {
        expect(INDEX).toContain('id="english-profile-shell" data-i18n-aria-label="profile.language.shellAria" aria-label="언어"');
        expect(EN_INDEX).toContain('id="english-profile-shell" data-i18n-aria-label="profile.language.shellAria" aria-label="Language and community"');
    });
});
