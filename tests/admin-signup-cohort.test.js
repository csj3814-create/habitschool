import { describe, expect, it } from 'vitest';
import cohortModule from '../functions/admin-signup-cohort.js';
import { readRepoFile } from './source-helpers.js';

const { buildSignupCohortSummary, validateRange, kstDateOf, classifySignupSource } = cohortModule;

// 관제탑 가입 통계 (tasks/2026-10-29_admin_signup_cohort_stats.md 1안).
// 모두 합성 자료다. 회원 자료는 쓰지 않는다.

const at = (iso) => Date.parse(iso);
const user = (uid, iso, extra = {}) => ({ uid, createdMs: at(iso), pendingDeletion: false, ...extra });
const doc = (iso, extra = {}) => ({ createdAtMs: at(iso), referredBy: false, signupSource: null, ...extra });

function summarize({ users, docs = {}, admins = [], excluded = [], startDate = '2026-10-20', endDate = '2026-10-21' }) {
    return buildSignupCohortSummary({
        authUsers: users,
        userDocs: new Map(Object.entries(docs)),
        adminUids: new Set(admins),
        excludedUids: new Set(excluded),
        startDate,
        endDate,
        observedAtMs: at('2026-10-29T03:00:00Z'),
    });
}

describe('signup cohort period', () => {
    it('cuts days at KST midnight, both ends included', () => {
        const r = summarize({
            users: [
                user('before', '2026-10-19T14:59:59Z'), // KST 10/19 23:59:59
                user('first', '2026-10-19T15:00:00Z'), // KST 10/20 00:00:00
                user('last', '2026-10-21T14:59:59Z'), // KST 10/21 23:59:59
                user('after', '2026-10-21T15:00:00Z'), // KST 10/22 00:00:00
            ],
        });
        expect(r.denominator.authCreated).toBe(2);
        expect(r.days).toEqual([{ date: '2026-10-20', count: 1 }, { date: '2026-10-21', count: 1 }]);
    });

    it('lists every day in the range, including days with no signups', () => {
        const r = summarize({ users: [], startDate: '2026-10-01', endDate: '2026-10-03' });
        expect(r.days.map((d) => d.count)).toEqual([0, 0, 0]);
        expect(kstDateOf(at('2026-10-01T15:00:00Z'))).toBe('2026-10-02');
    });

    it('refuses malformed, reversed and over-long ranges', () => {
        expect(validateRange('2026-10-01', '2026-10-31')).toBe('');
        expect(validateRange('2026-10-1', '2026-10-31')).not.toBe('');
        expect(validateRange('2026-02-30', '2026-03-01')).not.toBe('');
        expect(validateRange('2026-10-31', '2026-10-01')).toBe('시작일이 종료일보다 늦습니다.');
        expect(validateRange('2025-01-01', '2026-10-01')).toBe('기간은 366일 이내로 골라 주세요.');
    });
});

describe('signup cohort denominator', () => {
    it('takes admins, marked test accounts and held accounts out, each into its own count', () => {
        const r = summarize({
            users: [
                user('admin', '2026-10-20T01:00:00Z'),
                user('tester', '2026-10-20T01:00:00Z'),
                user('held', '2026-10-20T01:00:00Z', { pendingDeletion: true }),
                user('member', '2026-10-20T01:00:00Z'),
            ],
            docs: { admin: doc('2026-10-20T01:00:00Z'), tester: doc('2026-10-20T01:00:00Z'), member: doc('2026-10-20T01:00:00Z') },
            admins: ['admin'],
            excluded: ['tester'],
        });
        expect(r.denominator).toEqual({ authCreated: 4, admins: 1, testExcluded: 1, held: 1, included: 1 });
        // 보관 중인 계정은 회원 문서가 보관함에 있다 — "가입 미완료" 로 세면 안 된다.
        expect(r.timing.noUserDoc).toBe(0);
        expect(r.meta.testExclusionListSize).toBe(1);
    });

    it('says when there is no test-account list at all', () => {
        const r = summarize({ users: [user('member', '2026-10-20T01:00:00Z')] });
        expect(r.meta.testExclusionListSize).toBe(0);
        expect(r.meta.scope).toContain('탈퇴자 제외');
    });

    it('counts accounts that never finished signing up, and only flags (does not drop) clock mismatches', () => {
        const r = summarize({
            users: [
                user('nodoc', '2026-10-20T01:00:00Z'),
                user('ok', '2026-10-20T01:00:00Z'),
                user('late', '2026-10-20T01:00:00Z'),
                user('nostamp', '2026-10-20T01:00:00Z'),
            ],
            docs: {
                ok: doc('2026-10-20T01:09:59Z'),
                late: doc('2026-10-20T01:10:01Z'),
                nostamp: { referredBy: false, signupSource: null, createdAtMs: NaN },
            },
        });
        expect(r.timing).toEqual({ noUserDoc: 1, createdAtMissing: 1, createdAtMismatch: 1 });
        expect(r.denominator.included).toBe(4);
        expect(r.sourceBase).toBe(3);
    });
});

describe('signup cohort sources', () => {
    it('keeps missing records apart: before collection started, missing after, filled late, stale first visit', () => {
        const r = summarize({
            startDate: '2026-09-26',
            endDate: '2026-10-21',
            users: [
                user('old', '2026-09-26T03:00:00Z'),
                user('gap', '2026-10-20T03:00:00Z'),
                user('late', '2026-10-20T03:00:00Z'),
                user('stale', '2026-10-20T03:00:00Z'),
                user('fresh', '2026-10-20T03:00:00Z'),
            ],
            docs: {
                old: doc('2026-09-26T03:00:00Z'),
                gap: doc('2026-10-20T03:00:00Z'),
                late: doc('2026-10-20T03:00:00Z', { signupSource: { path: '/', at: '2026-10-20T03:00:00Z', late: true } }),
                stale: doc('2026-10-20T03:00:00Z', { signupSource: { src: 'tiktok', at: '2026-10-13T03:00:00Z' } }),
                fresh: doc('2026-10-20T03:00:00Z', { signupSource: { src: 'tiktok', at: '2026-10-13T03:00:01Z' } }),
            },
        });
        expect(r.missing).toEqual({ beforeCollection: 1, afterCollection: 1, late: 1, staleFirstVisit: 1 });
    });

    it('lets one person show in several evidence columns but only one primary bucket', () => {
        const r = summarize({
            users: [user('a', '2026-10-20T01:00:00Z')],
            docs: { a: doc('2026-10-20T01:00:00Z', { signupSource: { src: 'tiktok', app: 'kakaotalk', referrer: 'm.youtube.com', ref: 'ABC123' } }) },
        });
        expect(r.primary).toEqual([{ key: 'tiktok', count: 1 }]);
        expect(r.evidence.tags).toEqual([{ key: 'tiktok', count: 1 }]);
        expect(r.evidence.apps).toEqual([{ key: 'kakaotalk', count: 1 }]);
        expect(r.evidence.referrers).toEqual([{ key: 'm.youtube.com', count: 1 }]);
        expect(r.evidence.inviteMark).toBe(1);
    });

    it('crosses the invite mark on the device with the server-side invite link', () => {
        const signup = '2026-10-20T01:00:00Z';
        const r = summarize({
            users: ['both', 'refOnly', 'referredOnly', 'neither'].map((uid) => user(uid, signup)),
            docs: {
                both: doc(signup, { referredBy: true, signupSource: { ref: 'ABC123' } }),
                refOnly: doc(signup, { signupSource: { ref: 'ABC123' } }),
                referredOnly: doc(signup, { referredBy: true, signupSource: { path: '/' } }),
                neither: doc(signup, { signupSource: { path: '/' } }),
            },
        });
        expect(r.invite).toEqual({ both: 1, refOnly: 1, referredOnly: 1, neither: 1 });
    });

    it('returns totals only — no uid or other per-member value leaves the server', () => {
        const r = summarize({
            users: [user('uid-secret-1', '2026-10-20T01:00:00Z'), user('uid-secret-2', '2026-10-20T01:00:00Z')],
            docs: { 'uid-secret-1': doc('2026-10-20T01:00:00Z', { referredBy: 'uid-inviter-secret', signupSource: { ref: 'ABC123', at: '2026-10-20T00:59:00Z' } }) },
            admins: ['uid-admin-secret'],
        });
        const text = JSON.stringify(r);
        expect(text).not.toMatch(/secret/);
        expect(text).not.toContain('ABC123');
        expect(text).not.toContain('2026-10-20T00:59:00Z');
    });

    it('classifies the same way as the command-line source script', async () => {
        const script = await import('../scripts/signup-sources.mjs');
        expect(script.classifySignupSource).toBe(classifySignupSource);
    });
});

describe('signup cohort wiring', () => {
    const RUNTIME = readRepoFile('functions/runtime.js');
    const ADMIN = readRepoFile('admin.html');
    const DELETION = readRepoFile('functions/account-deletion.js');
    const callable = RUNTIME.slice(RUNTIME.indexOf('exports.getAdminSignupCohort'), RUNTIME.indexOf('// ── 관제탑: 건강 지표 추이'));

    it('is an admin-only callable that reads Auth page by page and only three user fields', () => {
        expect(callable).toContain('await assertAdminRequest(request);');
        expect(callable).toContain('admin.auth().listUsers(1000, pageToken)');
        expect(callable).toContain('customClaims?.accountDeletionPending');
        expect(callable).toContain('const fieldMask = ["createdAt", "referredBy", "settings.signupSource"];');
        expect(callable).toContain('db.collection("stats_exclusions")');
    });

    it('is its own tab, not part of the dashboard snapshot', () => {
        expect(ADMIN).toContain("httpsCallable(fns, 'getAdminSignupCohort'");
        const dashboard = RUNTIME.slice(RUNTIME.indexOf('exports.getAdminDashboardSnapshot'), RUNTIME.indexOf('\nexports.', RUNTIME.indexOf('exports.getAdminDashboardSnapshot') + 10));
        expect(dashboard).not.toContain('listUsers');
        expect(ADMIN).toContain('data-tab="signups"');
        expect(ADMIN).toContain('id="tab-signups"');
    });

    it('deletes the test-account mark together with the account', () => {
        const byUid = DELETION.split('const OWNED_DOCS_BY_UID = Object.freeze([')[1].split(']);')[0];
        expect(byUid).toContain('"stats_exclusions"');
    });
});

describe('signup source names in the admin', () => {
    it('names the Play Store app instead of showing its package', () => {
        // TWA 첫 방문의 이전 사이트는 android-app://com.habitschool.app → hostname 만 남는다.
        expect(cohortModule.classifySignupSource({ referrer: 'com.habitschool.app' }, null)).toBe('com.habitschool.app');
        expect(readRepoFile('admin.html')).toContain("'com.habitschool.app': '플레이 스토어 앱'");
    });
});
