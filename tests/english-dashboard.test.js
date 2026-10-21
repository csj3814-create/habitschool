// 영어 앱 대시보드 (해외 3단계 E4-1, 2026-10-21). 오늘 요약·빠른 기록·이번 주·주간 미션·레벨·미션 배지·마일스톤·
// 커뮤니티 현황·건강 점수를 연다. 해빛 메시지·소모임·30일 결과지·식단 방법 칩은 E4-2 까지 영어에서 숨긴다.

import { afterEach, describe, expect, it } from 'vitest';
import { readRawRepoFile, readRepoFile } from './source-helpers.js';
import { getDefaultTabForRoute, getRouteContext } from '../js/app-mode.js';
import { EN_MESSAGES } from '../js/i18n-en.js';
import { KO_MESSAGES } from '../js/i18n-ko.js';
import { decideWeeklyMissionGate, describeWeeklyMissionGate } from '../js/mission-gate.js';
import { buildAttendanceChipsHtml, buildCommunityEmptyStateHtml, buildStreakHighlightHtml } from '../js/community-stats-view.js';

const HANGUL = /[가-힣]/;
const EN_INDEX = readRepoFile('en/index.html');
const EN_CSS = readRepoFile('styles-en.css').replace(/\/\*[\s\S]*?\*\//g, '');
// firebase-config.js 는 인터넷 주소(Firebase SDK)를 가져와 테스트에서 직접 못 읽는다. 정의는 파일 글자에서 읽는다.
const CONFIG = readRawRepoFile('js/firebase-config.js');
const between = (start, end) => CONFIG.slice(CONFIG.indexOf(start), CONFIG.indexOf(end, CONFIG.indexOf(start)));
const MISSION_IDS = [...between('export const MISSIONS', 'export const MISSION_BADGES').matchAll(/id: '(m\d_\w+?)'/g)].map((m) => m[1]);
const MISSION_LEVELS = [...between('export const MISSIONS', 'export const MISSION_BADGES').matchAll(/^    (\d): \{/gm)].map((m) => m[1]);
const MILESTONE_BLOCK = between('export const MILESTONES', 'export const MISSIONS');
const MILESTONE_GROUPS = [...MILESTONE_BLOCK.matchAll(/^    (\w+): \{/gm)].map((m) => m[1]);
const MILESTONE_IDS = [...MILESTONE_BLOCK.matchAll(/\{ id: '(\w+)'/g)].map((m) => m[1]);
const MISSION_BADGE_IDS = [...CONFIG.slice(CONFIG.indexOf('export const MISSION_BADGES')).split('};')[0].matchAll(/id: '(\w+)'/g)].map((m) => m[1]);

function onPath(pathname) {
    globalThis.window = { location: { pathname, origin: 'https://habitschool.web.app' } };
}
afterEach(() => { delete globalThis.window; });

describe('영어 앱은 대시보드에서 시작한다', () => {
    it('첫 탭이 대시보드다', () => {
        expect(getDefaultTabForRoute(getRouteContext('/en'))).toBe('dashboard');
        expect(EN_INDEX).toMatch(/data-i18n="tab\.dashboardLabel"[^>]*>📊 My records<\/button>/);
    });

    it('E4-2 로 미룬 카드는 영어에서 숨는다', () => {
        for (const selector of ['#admin-feedback-box', '#coach-archive-modal', '#social-challenge-card', '.pdf-btn-compact', '#dashboard-diet-program-summary', '.community-history-btn-wrap']) {
            expect(EN_CSS, selector).toContain(`html.locale-en ${selector}`);
        }
    });

    it('영어 대시보드·레벨 안내 창에서 보이는 정적 글자에 한글이 없다 (숨긴 카드 빼고)', () => {
        const visibleKorean = (start, end) => {
            const from = EN_INDEX.indexOf(start);
            let section = EN_INDEX.slice(from, EN_INDEX.indexOf(end, from))
                .replace(/<!--[\s\S]*?-->/g, '')
                .replace(/<script[\s\S]*?<\/script>/g, '');
            // 숨긴 카드(해빛 메시지·지난 메시지·식단 방법 칩·소모임·30일 결과지)를 잘라 낸다.
            const cut = (open, close) => {
                const a = section.indexOf(open);
                if (a < 0) return;
                const b = section.indexOf(close, a);
                section = section.slice(0, a) + section.slice(b + close.length);
            };
            cut('<div id="admin-feedback-box"', '<section class="dashboard-hero-shell"');
            cut('<div class="dashboard-diet-program-summary"', '<div class="dashboard-action-strip"');
            cut('<div class="card metrics-card social-challenge-dashboard-card"', '<div class="card dashboard-referral-shortcut"');
            cut('<button class="pdf-btn pdf-btn-compact"', '</button>');
            const attrs = [...section.matchAll(/\s(?:placeholder|aria-label|alt)="([^"]*)"/g)].map((m) => m[1]).join(' ');
            const text = `${section.replace(/<[^>]*>/g, ' ')} ${attrs}`.replace(/\s+/g, ' ');
            return text.split(' ').filter((w) => HANGUL.test(w));
        };
        expect(visibleKorean('<div id="dashboard"', '<div id="profile" class="content-section"')).toEqual([]);
        expect(visibleKorean('<div class="modal-overlay" id="level-modal">', '<div class="modal-overlay" id="chatbot-connect-modal"')).toEqual([]);
    });
});

describe('미션·마일스톤·배지·레벨 정의는 id 로 영어를 찾는다', () => {
    it('모든 미션 문구에 영어가 있다', () => {
        expect(MISSION_IDS).toHaveLength(45);
        for (const id of MISSION_IDS) {
            const value = EN_MESSAGES[`mission.${id}.text`];
            expect(value, id).toBeTruthy();
            expect(value).not.toMatch(HANGUL);
        }
        expect(MISSION_LEVELS).toEqual(['1', '2', '3', '4', '5']);
        for (const n of MISSION_LEVELS) expect(EN_MESSAGES[`mission.level.${n}.name`], n).toBeTruthy();
    });

    it('모든 마일스톤·묶음 이름과 미션 배지에 영어가 있다', () => {
        expect(MILESTONE_GROUPS).toEqual(['streak', 'diet', 'exercise', 'mind']);
        for (const group of MILESTONE_GROUPS) expect(EN_MESSAGES[`milestone.group.${group}`], group).toBeTruthy();
        expect(MILESTONE_IDS.length).toBeGreaterThan(20);
        for (const id of MILESTONE_IDS) {
            expect(EN_MESSAGES[`milestone.${id}.name`], id).toBeTruthy();
            expect(EN_MESSAGES[`milestone.${id}.desc`], id).toBeTruthy();
        }
        expect(MISSION_BADGE_IDS).toHaveLength(8);
        for (const id of MISSION_BADGE_IDS) {
            expect(EN_MESSAGES[`missionBadge.${id}.name`], id).toBeTruthy();
            expect(EN_MESSAGES[`missionBadge.${id}.desc`], id).toBeTruthy();
        }
    });

    it('정의 이름은 한국어 사전에 없어서 한국어 화면은 정의 그대로다', () => {
        const leaked = Object.keys(KO_MESSAGES).filter((key) => /^(mission\.(m\d|level\.)|milestone\.(streak|diet|exercise|mind|group)|missionBadge\.\w+\.(name|desc))/.test(key));
        expect(leaked).toEqual([]);
    });
});

describe('대시보드 모듈 문구', () => {
    it('주간 미션 관문 한 줄', () => {
        const gate = decideWeeklyMissionGate({}, 3);
        onPath('/en');
        expect(describeWeeklyMissionGate(gate)).toBe('3/7 days logged · at 7 days you can set your own weekly goals');
        onPath('/');
        expect(describeWeeklyMissionGate(gate)).toBe('기록 3/7일 · 7일이 되면 나만의 주간 목표를 세울 수 있어요');
    });

    it('커뮤니티 현황 꾸준함 줄', () => {
        const stats = { statsVersion: 2, streakTier: { days: 14, label: '14일 이상', count: 5 }, perfectAttendance: { days: 10, diet: 3, exercise: 0, mind: 2 } };
        onPath('/en');
        const enHtml = buildStreakHighlightHtml(stats) + buildAttendanceChipsHtml(stats) + buildCommunityEmptyStateHtml();
        expect(enHtml).not.toMatch(HANGUL);
        expect(enHtml).toContain('14+ days');
        onPath('/');
        expect(buildStreakHighlightHtml(stats)).toContain('🔥 연속 기록 <strong>14일 이상 5명</strong>');
        expect(buildAttendanceChipsHtml(stats)).toContain('식단 개근 <strong>3명</strong>');
    });
});
