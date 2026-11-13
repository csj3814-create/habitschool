import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';
import { buildBloodTestTrend, renderBloodTestTrendHtml, bloodTestDateOf } from '../js/blood-test-trend.js';
import { PROFILE_GROUPS_KEY, readProfileGroupState, resolveGroupOpen } from '../js/profile-groups.js';

// 2026-11-12~13 제보: 프로필 탭이 너무 길다 — 초대 목록과 체성분 추이는 쌓일수록 길어지고,
// 혈액검사는 지난번과 이어서 볼 수 없고, 무엇이 어디 있는지 찾기 어렵다.

const INDEX = readRepoFile('index.html');
const APP = readRepoFile('js/app-core.js');
const CSS = readRepoFile('styles-features.css');
const MAIN = readRepoFile('js/main.js');
const SW = readRepoFile('sw.js');

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
const test = (id, testDate, values) => ({
    id, testDate,
    metrics: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value, unit: 'mg/dL', status: 'normal' }]))
});

describe('blood tests line up side by side', () => {
    const records = [
        test('2026-11-13', '2026-11-01', { glucose: 98, hdl: 58, totalCholesterol: 192 }),
        test('2026-05-20', '2026-05-10', { glucose: 104, hdl: 52 }),
        test('2026-11-12', '2025-11-03', { glucose: 101, totalCholesterol: 205 })
    ];
    const trend = buildBloodTestTrend(records);

    it('orders by the day of the test, newest first, not by upload day', () => {
        expect(trend.dates).toEqual(['2026-11-01', '2026-05-10', '2025-11-03']);
        expect(bloodTestDateOf({ id: '2026-01-02' })).toBe('2026-01-02');
        expect(bloodTestDateOf({ id: 'abc' })).toBe('');
    });

    it('shows only metrics that were ever measured', () => {
        expect(trend.rows.map((row) => row.key)).toEqual(['glucose', 'totalCholesterol', 'hdl']);
    });

    it('compares each value with the test before it and says which way is better', () => {
        const glucose = trend.rows.find((row) => row.key === 'glucose').cells;
        expect(glucose[0]).toMatchObject({ value: 98, diff: -6, judged: 1 });
        expect(glucose[1]).toMatchObject({ value: 104, diff: 3, judged: -1 });
        expect(glucose[2]).toMatchObject({ value: 101, diff: null, judged: 0 });
        const hdl = trend.rows.find((row) => row.key === 'hdl').cells;
        expect(hdl[0]).toMatchObject({ value: 58, diff: 6, judged: 1 });
        expect(hdl[2]).toBe(null);
        // 중간 검사에 값이 없으면 그 앞 검사와 견준다.
        const chol = trend.rows.find((row) => row.key === 'totalCholesterol').cells;
        expect(chol[0]).toMatchObject({ value: 192, diff: -13, judged: 1 });
    });

    it('keeps at most six tests so the table stays a table', () => {
        const many = Array.from({ length: 9 }, (_, i) => test(`2026-0${i + 1}-01`, `2026-0${i + 1}-01`, { glucose: 90 + i }));
        expect(buildBloodTestTrend(many).dates).toHaveLength(6);
        expect(buildBloodTestTrend(many).dates[0]).toBe('2026-09-01');
    });

    it('draws nothing for no tests and escapes what it prints', () => {
        expect(renderBloodTestTrendHtml(buildBloodTestTrend([]), { escapeHtml })).toBe('');
        const html = renderBloodTestTrendHtml(
            buildBloodTestTrend([{ id: '2026-11-01', metrics: { glucose: { value: 98, unit: '<b>', status: 'normal' } } }]),
            { escapeHtml }
        );
        expect(html).not.toContain('<b>');
        expect(html).toContain('26.11.01');
        expect(html).toContain('공복혈당');
    });

    it('replaces the three-column history in the app', () => {
        expect(APP).toContain('renderBloodTestTrendHtml(buildBloodTestTrend(records), { en, escapeHtml })');
        expect(APP).not.toContain('이전 검사 이력');
        expect(CSS).toMatch(/\.blood-trend-table \.blood-trend-metric \{[^}]*position: sticky;/);
    });
});

describe('long lists show the latest and fold the rest', () => {
    it('hides folded rows until the host is expanded', () => {
        expect(CSS).toContain('[data-fold-host]:not(.is-expanded) .fold-extra { display: none; }');
        expect(APP).toContain("const expanded = host.classList.toggle('is-expanded');");
    });

    it('shows the newest body composition record and folds earlier ones', () => {
        expect(APP).toContain('const rows = records.slice().reverse().map((r, index) => {');
        expect(APP).toContain("return `<tr${index > 0 ? ' class=\"fold-extra\"' : ''}>");
        expect(APP).toContain('이전 기록 ${records.length - 1}건 보기');
    });

    it('shows three invited friends and folds the rest', () => {
        expect(APP).toContain('const INVITE_LIST_VISIBLE = 3;');
        expect(APP).toContain("index >= INVITE_LIST_VISIBLE ? ' class=\"fold-extra\"' : ''");
        expect(APP).toContain('전체 ${friends.length}명 보기');
        // 다시 그릴 때 펼친 상태가 남으면 버튼 글자와 어긋난다.
        expect(APP).toContain("listEl.classList.remove('is-expanded');");
    });

    it('shows the latest blood test notes and folds earlier ones', () => {
        expect(APP).toContain('이전 검사 ${olderCount}건 보기');
    });
});

describe('the profile tab is three groups', () => {
    const groupIds = [...INDEX.matchAll(/<details class="profile-group" id="profile-group-(\w+)" data-profile-group="(\w+)"( open)?>/g)];

    it('has health, friends and settings, with settings folded by default', () => {
        expect(groupIds.map((m) => m[1])).toEqual(['health', 'friends', 'settings']);
        expect(groupIds.map((m) => !!m[3])).toEqual([true, true, false]);
        groupIds.forEach((m) => expect(m[1]).toBe(m[2]));
    });

    it('puts each card in the group its name promises', () => {
        const at = (text) => {
            const index = INDEX.indexOf(text);
            expect(index, text).toBeGreaterThan(-1);
            return index;
        };
        const health = at('id="profile-group-health"');
        const friends = at('id="profile-group-friends"');
        const settings = at('id="profile-group-settings"');
        const assets = at('<div id="assets" class="content-section"');
        const within = (text, from, to) => {
            const index = at(text);
            expect(index > from && index < to, text).toBe(true);
        };
        within('id="sensitive-consent-group"', health, friends);
        within('id="blood-test-history"', health, friends);
        within('id="profile-friend-invite-card"', friends, settings);
        within('id="profile-friend-requests-card"', friends, settings);
        within('id="profile-nickname"', settings, assets);
        within('onclick="logoutAndReset()"', settings, assets);
        // 묶음은 프로필 탭 안에서 열리고 닫힌다.
        const profileBlock = INDEX.slice(at('<details class="profile-group" id="profile-group-health"'), assets);
        expect(profileBlock.match(/<details class="profile-group"/g)).toHaveLength(3);
        expect(profileBlock.match(/<\/details>/g).length).toBeGreaterThanOrEqual(3);
    });

    it('offers a jump row to each group', () => {
        for (const key of ['health', 'friends', 'settings']) {
            expect(INDEX).toContain(`onclick="jumpToProfileGroup('${key}')"`);
        }
    });

    it('remembers what the member opened and closed, falling back to the default', () => {
        expect(resolveGroupOpen({}, 'settings', false)).toBe(false);
        expect(resolveGroupOpen({ settings: true }, 'settings', false)).toBe(true);
        expect(resolveGroupOpen({ health: false }, 'health', true)).toBe(false);
        expect(resolveGroupOpen({ health: 'yes' }, 'health', true)).toBe(true);
        const storage = (value) => ({ getItem: (key) => (key === PROFILE_GROUPS_KEY ? value : null) });
        expect(readProfileGroupState(storage('{"settings":true}'))).toEqual({ settings: true });
        expect(readProfileGroupState(storage('[1]'))).toEqual({});
        expect(readProfileGroupState(storage('broken'))).toEqual({});
    });

    it('opens a folded group before scrolling to something inside it', () => {
        const fn = APP.split('function focusElementWithHighlight(target) {')[1].split('\n}')[0];
        expect(fn).toContain('revealInClosedDetails(target);');
        expect(APP).toContain("if (node.tagName === 'DETAILS' && !node.open) node.open = true;");
    });

    it('is loaded at start and kept for offline use', () => {
        expect(MAIN).toMatch(/import '\.\/profile-groups\.js\?v=\d+';/);
        expect(SW).toMatch(/'\.\/js\/profile-groups\.js\?v=\d+',/);
        expect(SW).toMatch(/'\.\/js\/blood-test-trend\.js\?v=\d+',/);
    });
});
