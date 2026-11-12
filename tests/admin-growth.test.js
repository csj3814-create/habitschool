import { describe, expect, it } from 'vitest';
import growthModule from '../functions/admin-growth.js';
import { readRepoFile } from './source-helpers.js';

// 2026-11-12: 가입·첫 기록·복귀 숫자를 물을 때마다 스크립트로 쟀다. 관제탑 첫 화면에 둔다.

const { buildAdminGrowth } = growthModule;
const TODAY = '2026-11-12';

describe('buildAdminGrowth', () => {
    it('counts signups for the last 7 days and the 7 before', () => {
        const users = [
            { uid: 'a', createdDate: '2026-11-12' },
            { uid: 'b', createdDate: '2026-11-06' },
            { uid: 'c', createdDate: '2026-11-05' },
            { uid: 'd', createdDate: '2026-10-30' },
            { uid: 'e', createdDate: '2026-10-29' },
        ];
        expect(buildAdminGrowth({ todayStr: TODAY, users }).signups).toEqual({ last7: 2, prev7: 2 });
    });

    it('leaves out people who joined yesterday or today from the first-record rate', () => {
        const users = [
            { uid: 'today', createdDate: '2026-11-12' },
            { uid: 'yesterday', createdDate: '2026-11-11' },
            { uid: 'did', createdDate: '2026-11-10' },
            { uid: 'didnt', createdDate: '2026-11-01' },
            { uid: 'old', createdDate: '2026-10-20' },
        ];
        const logDatesByUid = { today: ['2026-11-12'], did: ['2026-11-11'], old: ['2026-10-20'] };
        const got = buildAdminGrowth({ todayStr: TODAY, users, logDatesByUid }).firstRecord;
        expect(got).toMatchObject({ signups: 2, recorded: 1, rate: 50, prevSignups: 1, prevRate: 100 });
    });

    it('counts a first week as kept only with two or more record days inside it', () => {
        const users = [
            { uid: 'kept', createdDate: '2026-11-01' },
            { uid: 'once', createdDate: '2026-11-01' },
            { uid: 'late', createdDate: '2026-11-01' },
        ];
        const logDatesByUid = {
            kept: ['2026-11-01', '2026-11-07'],
            once: ['2026-11-02'],
            late: ['2026-11-01', '2026-11-08'],
        };
        expect(buildAdminGrowth({ todayStr: TODAY, users, logDatesByUid }).week1)
            .toEqual({ signups: 3, kept: 1, rate: 33 });
    });

    it('measures email returns only for mail that has had its 7 days', () => {
        const emailSends = [
            { uid: 'back', kind: 'lapse2', date: '2026-11-01' },
            { uid: 'gone', kind: 'lapse2', date: '2026-11-01' },
            { uid: 'fresh', kind: 'lapse2', date: '2026-11-08' },
            { uid: 'first', kind: 'firstRecord', date: '2026-10-20' },
        ];
        const logDatesByUid = { back: ['2026-11-05'], gone: ['2026-11-10'], fresh: ['2026-11-09'], first: ['2026-10-27'] };
        const got = buildAdminGrowth({ todayStr: TODAY, logDatesByUid, emailSends }).emails;
        expect(got.lapse2).toEqual({ sent: 2, back: 1, rate: 50 });
        expect(got.firstRecord).toEqual({ sent: 1, back: 1, rate: 100 });
        expect(got.lapse7).toEqual({ sent: 0, back: 0, rate: null });
    });

    it('reports push, referral and Play app reach without naming anyone', () => {
        const users = [
            { uid: 'a', createdDate: '2026-11-01', referred: true, lastAppOpenDate: '2026-11-10' },
            { uid: 'b', createdDate: '2026-11-02', referred: false, lastAppOpenDate: '' },
            { uid: 'c', createdDate: '2026-09-01', referred: true, lastAppOpenDate: '2026-09-02' },
        ];
        const logDatesByUid = { a: ['2026-11-11'], b: ['2026-11-03'], c: ['2026-09-30'] };
        const got = buildAdminGrowth({ todayStr: TODAY, users, logDatesByUid, pushUids: ['a', 'c'] });
        expect(got.push).toEqual({ active30: 2, connected: 1, rate: 50 });
        expect(got.spread).toEqual({ signups30: 2, referred30: 1, referredRate: 50, playApp30: 1 });
        expect(JSON.stringify(got)).not.toMatch(/"uid"/);
    });
});

describe('getAdminGrowth and the dashboard', () => {
    const RUNTIME = readRepoFile('functions/runtime.js');
    const ADMIN = readRepoFile('admin.html');
    const FN = RUNTIME.split('exports.getAdminGrowth = onCall(')[1].split('\n);')[0];

    it('is admin only and counts automatic mail only', () => {
        expect(FN).toContain('await assertAdminRequest(request);');
        expect(FN).toContain('if (entry?.trigger !== "scheduled" || !entry.sentAt) return;');
        expect(FN).toContain('return buildAdminGrowth({');
    });

    it('loads beside the dashboard so a failure does not blank the rest', () => {
        const load = ADMIN.split('async function loadDashboard() {')[1].split('\n    }')[0];
        expect(load).toContain('loadGrowth();');
        expect(load).not.toContain('await loadGrowth()');
        expect(ADMIN).toContain("const getAdminGrowthCallable = httpsCallable(fns, 'getAdminGrowth');");
        for (const id of ['g-signups', 'g-first', 'g-week1', 'g-active', 'g-lapse', 'g-nudge', 'g-push', 'g-referred']) {
            expect(ADMIN).toContain(`id="${id}"`);
        }
    });

    it('names the last tab for what it shows, wraps the tab row, and opens signups with data', () => {
        expect(ADMIN).toContain('📱 앱 &amp; 시스템</button>');
        expect(ADMIN).not.toContain('초대 &amp; 시스템');
        expect(ADMIN.split('.tab-nav {')[1].split('}')[0]).toContain('flex-wrap: wrap;');
        const prepare = ADMIN.split('function prepareSignupCohortTab() {')[1].split('\n    }')[0];
        expect(prepare).toContain('window.loadSignupCohort();');
    });

    it('shows what a failed challenge burned', () => {
        expect(RUNTIME).toContain('burned: row.type === "challenge_failure" && Number(row.burned ?? row.staked) > 0');
        expect(ADMIN).toContain("if (typeof t.burned === 'number') return `-${t.burned.toLocaleString()} HBT 소각`;");
    });
});

// 2026-11-12 대표 요청: 대시보드를 한눈에 들어오게 두 화면으로, 쿠폰 표는 접히지 않게.
describe('dashboard has two views and the coupon table reads on one line', () => {
    const ADMIN = readRepoFile('admin.html');

    it('splits the dashboard into growth and activity, growth first', () => {
        const dashboard = ADMIN.split('<div id="tab-dashboard"')[1].split('<div id="tab-signups"')[0];
        const growth = dashboard.split('<div id="dash-view-growth">')[1].split('<div id="dash-view-activity"')[0];
        const activity = dashboard.split('<div id="dash-view-activity" style="display:none;">')[1];
        for (const id of ['s-total', 's-today', 's-week', 's-reports', 's-health', 'g-signups', 'g-referred']) {
            expect(growth).toContain(`id="${id}"`);
        }
        for (const id of ['s-hbt', 's-points', 's-rate', 'activityChart', 'top5-body', 'recordTypeChart', 'challenge-body', 'cohort-trend-body']) {
            expect(activity).toContain(`id="${id}"`);
            expect(growth).not.toContain(`id="${id}"`);
        }
        expect(ADMIN).toContain("window.selectDashboardView = function(view) {");
        expect(ADMIN).toContain('chart.resize();');
    });

    it('keeps coupon dates on one line, names every status, and shortens the uid', () => {
        expect(ADMIN).toContain('.reward-admin-table { min-width: 880px; }');
        expect(ADMIN).toContain("createdLabel: createdAt ? formatAdminDateTimeCompact(createdAt) : '-',");
        expect(ADMIN).toContain("if (status === 'used_completed') return `<span class=\"badge badge-green\">사용 완료</span>${userRemovedTag}`;");
        expect(ADMIN).toContain("if (status === 'expired') return `<span class=\"badge badge-gray\">기간 만료</span>${userRemovedTag}`;");
        expect(ADMIN).toContain("${escapeHtml(String(row.userId || '-').slice(0, 6))}…</div>");
        const body = ADMIN.split('function formatAdminDateTimeCompact(value) {')[1].split('\n    }')[0];
        const format = new Function('value', body);
        expect(format(new Date(2026, 6, 18, 0, 21))).toBe('2026-07-18 00:21');
        expect(format('nope')).toBe('-');
    });
});

// 2026-11-12 화면을 보며 찾은 것 네 가지.
describe('console fixes found by looking at each screen', () => {
    const ADMIN = readRepoFile('admin.html');

    it('counts used and expired coupons as issued', () => {
        expect(ADMIN).toContain("const REWARD_MARKET_ISSUED_STATUSES = ['issued', 'used_completed', 'expired'];");
        expect(ADMIN).toContain('issued: realRows.filter((row) => REWARD_MARKET_ISSUED_STATUSES.includes(row.status)).length,');
    });

    it('says coupon reasons in words and leaves unknown ones as they are', () => {
        const labels = ADMIN.split('const REWARD_MARKET_REASON_LABELS = {')[1].split('};')[0];
        const body = ADMIN.split('function describeRewardMarketReason(reason) {')[1].split('\n    }')[0];
        const describe_ = new Function('REWARD_MARKET_REASON_LABELS', 'reason', body);
        const table = new Function(`return {${labels}};`)();
        expect(describe_(table, 'mock_manual_resend:admin_provider_recheck')).toBe('관제탑에서 재조회했습니다 (테스트 발급)');
        expect(describe_(table, 'provider_coupon_payload_missing')).toBe('공급사가 쿠폰 번호를 주지 않았습니다');
        expect(describe_(table, 'E0012 잔액 부족')).toBe('E0012 잔액 부족');
        expect(describe_(table, '')).toBe('');
    });

    it('puts glucose and blood pressure in one cell and keeps the red for high values', () => {
        const body = ADMIN.split('function renderMemberHealthCell(r) {')[1].split('\n    }')[0];
        const cell = new Function('r', body);
        expect(cell({})).toContain('>-<');
        expect(cell({ glucose: 130, sys: 120, dia: 80 })).toContain('#C62828');
        expect(cell({ glucose: 95, sys: 120, dia: 80 })).not.toContain('#C62828');
        expect(cell({ glucose: 95, sys: 120, dia: 80 })).toContain('120/80');
    });

    it('shows who each admin is', () => {
        const load = ADMIN.split('async function loadAdmins() {')[1].split('\n    }')[0];
        expect(load).toContain("getDoc(doc(db, 'users', d.id))");
        expect(load).toContain("names[d.id] ? `<strong>${escapeHtml(names[d.id])}</strong> · ` : ''");
    });
});
