// 영어 앱 = /app 과 같은 전체 앱 (해외 3단계 E2, 2026-10-21 대표: "/en 의 심플 형태를 유지하지 않는다").
// 탭은 번역해 여는 대로 ENGLISH_TABS 에 늘고, 아직 아닌 것은 styles-en.css 의 "옮기지 않은 것" 목록이 숨긴다.

import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';
import { getAllowedTabsForRoute, getRouteContext } from '../js/app-mode.js';
import { runHead } from './head-script-harness.mjs';

const EN_CSS = readRepoFile('styles-en.css').replace(/\/\*[\s\S]*?\*\//g, '');
const EN_INDEX = readRepoFile('en/index.html');
const AUTH = readRepoFile('js/auth.js');
const ALL_TABS = ['dashboard', 'diet', 'exercise', 'sleep', 'profile', 'gallery', 'assets'];

function hiddenInEnglish(selector) {
    const blocks = [...EN_CSS.matchAll(/([^{}]+)\{\s*display:\s*none\s*!important;\s*\}/g)].map((match) => match[1]);
    return blocks.some((block) => block.split(',').map((s) => s.trim()).includes(`html.locale-en ${selector}`));
}

describe('영어 앱은 전체(default) 앱이다', () => {
    const context = getRouteContext('/en');
    const englishTabs = getAllowedTabsForRoute(context);

    it('심플 모드가 아니다', () => {
        expect(context.mode).toBe('default');
        expect(context.isSimple).toBe(false);
        const head = runHead({ file: 'en/index.html', path: '/en', languages: ['en-US'] });
        expect(head.classes).toContain('locale-en');
        expect(head.classes).not.toContain('simple-mode');
    });

    it('열린 탭은 한국어 앱 탭의 일부이고, 열리지 않은 탭은 영어에서 단추와 화면이 숨는다', () => {
        expect(englishTabs.every((tab) => ALL_TABS.includes(tab))).toBe(true);
        for (const tab of ALL_TABS) {
            const hidden = hiddenInEnglish(`#${tab}`) && hiddenInEnglish(`button[onclick*="openTab('${tab}'"]`);
            expect(hidden, tab).toBe(!englishTabs.includes(tab));
        }
    });

    it('초록 전용 디자인(카드·단추·폭 430px)은 은퇴했다 — 앱 화면은 /app 디자인', () => {
        expect(EN_CSS).not.toMatch(/html\.locale-en \.card,/);
        expect(EN_CSS).not.toMatch(/html\.locale-en \.submit-btn \{|html\.locale-en \.submit-btn,/);
        expect(EN_CSS).not.toMatch(/max-width:\s*430px/);
        // 소개 페이지 디자인은 그대로 둔다(대표).
        expect(EN_CSS).toMatch(/html\.locale-en\.en-landing body \{/);
        expect(EN_CSS).toMatch(/html\.en-landing \.english-public-page \{/);
    });

    it('카카오 단톡방 배너는 영어 앱에서 계속 숨는다 (한국 전용)', () => {
        expect(hiddenInEnglish('.chat-banner-fixed')).toBe(true);
    });

    it('전체 모드에서 새로 보이는 식단 사진 안내는 영어로 온다', () => {
        expect(EN_INDEX).toContain('data-i18n="diet.uploadCta.title">Upload a meal photo!</strong>');
        expect(EN_INDEX).toMatch(/data-i18n="diet\.uploadCta\.camera">Take a photo<\/button>/);
        expect(EN_INDEX).toMatch(/data-i18n="diet\.uploadCta\.library">Choose a photo<\/button>/);
    });
});

describe('영어 커뮤니티 방 = 텔레그램 (2026-10-21 대표)', () => {
    it('영어 프로필에 텔레그램 카드가 있고 새 창으로 연다', () => {
        expect(EN_INDEX).toMatch(/<a class="english-community-btn" href="https:\/\/t\.me\/habitschool" target="_blank" rel="noopener">Join on Telegram<\/a>/);
    });

    it('알림 단추를 찾는 코드가 텔레그램 단추를 집지 않는다', () => {
        expect(AUTH).toContain("document.querySelector('#english-profile-shell .english-profile-primary-btn')");
        const shell = EN_INDEX.slice(EN_INDEX.indexOf('id="english-profile-shell"'), EN_INDEX.indexOf('class="english-profile-logout"'));
        const firstPrimary = shell.match(/<[^>]*class="[^"]*english-profile-primary-btn[^"]*"[^>]*>/)[0];
        expect(firstPrimary).toContain('requestAppNotificationPermission');
    });
});
