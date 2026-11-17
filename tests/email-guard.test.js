import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readRepoFile } from './source-helpers.js';

const require = createRequire(import.meta.url);
const guard = require('../functions/email-guard.js');
const { _test: t } = guard;

function fakeDb(initial = {}) {
    const docs = new Map(Object.entries(initial).map(([id, data]) => [id, { ...data }]));
    return {
        docs,
        collection(name) {
            expect(name).toBe('emailLogs');
            return {
                doc(id) {
                    return {
                        async get() {
                            const data = docs.get(id);
                            return { exists: data !== undefined, data: () => data };
                        },
                        async set(patch, options) {
                            expect(options).toEqual({ merge: true });
                            docs.set(id, { ...(docs.get(id) || {}), ...patch });
                        },
                    };
                },
            };
        },
    };
}

function fakeTransporter() {
    const sent = [];
    return { sent, async sendMail(mail) { sent.push(mail); } };
}

const BASE = 'https://habitschool.web.app';
const baseMail = { from: '"해빛스쿨" <x@example.com>', to: 'member@example.com', subject: '제목', html: '<div>본문</div>' };

describe('빈도 상한', () => {
    it('기록이 없으면 보낸다', () => {
        expect(t.checkAutomatedEmailAllowed({}, '2026-11-17')).toEqual({ allowed: true });
    });

    it('이틀 전에 받았으면 막고, 사흘 전이면 보낸다', () => {
        const twoDaysAgo = { lastAutomatedEmailAt: '2026-11-15T01:00:00.000Z' };
        const threeDaysAgo = { lastAutomatedEmailAt: '2026-11-14T01:00:00.000Z' };
        expect(t.checkAutomatedEmailAllowed(twoDaysAgo, '2026-11-17')).toMatchObject({ allowed: false, reason: 'recentlyEmailed' });
        expect(t.checkAutomatedEmailAllowed(threeDaysAgo, '2026-11-17').allowed).toBe(true);
    });

    it('배포 전 기록(연속 알림, 복귀 안내, lastSentAt)도 센다', () => {
        expect(t.checkAutomatedEmailAllowed({ streakAlertSentAt: '2026-11-16T13:00:00.000Z' }, '2026-11-17').allowed).toBe(false);
        expect(t.checkAutomatedEmailAllowed({ reEngagementHistory: [{ sentAt: '2026-11-16T01:00:00.000Z' }] }, '2026-11-17').allowed).toBe(false);
        const ts = { toMillis: () => Date.parse('2026-11-16T01:00:00.000Z') };
        expect(t.checkAutomatedEmailAllowed({ lastSentAt: ts }, '2026-11-17').allowed).toBe(false);
    });

    it('KST 날짜로 센다 (UTC 밤 = KST 다음 날 아침)', () => {
        // 2026-11-13T16:00Z 는 KST 11/14 01:00 이다. 11/17 과 3일 차이라 보낸다.
        expect(t.toKstDate('2026-11-13T16:00:00.000Z')).toBe('2026-11-14');
        expect(t.checkAutomatedEmailAllowed({ lastAutomatedEmailAt: '2026-11-13T16:00:00.000Z' }, '2026-11-17').allowed).toBe(true);
    });

    it('수신 거부한 분께는 보내지 않는다', () => {
        expect(t.checkAutomatedEmailAllowed({ emailOptOut: true }, '2026-11-17')).toMatchObject({ allowed: false, reason: 'optedOut' });
    });
});

describe('sendGuardedMemberEmail', () => {
    it('수신 거부 링크와 원클릭 머리글을 붙여 보내고 기록한다', async () => {
        const db = fakeDb();
        const transporter = fakeTransporter();
        const result = await guard.sendGuardedMemberEmail({
            db, transporter, uid: 'u1', locale: 'ko', kind: 'streakAlert', appBaseUrl: BASE,
            todayKst: '2026-11-17', mail: baseMail, now: () => '2026-11-17T01:00:00.000Z',
        });
        expect(result).toEqual({ sent: true });
        expect(transporter.sent).toHaveLength(1);
        const mail = transporter.sent[0];
        const token = db.docs.get('u1').unsubscribeToken;
        expect(token).toMatch(/^[A-Za-z0-9_-]{24}$/);
        const url = `${BASE}/unsubscribe?u=u1&t=${token}`;
        expect(mail.headers['List-Unsubscribe']).toBe(`<${url}>`);
        expect(mail.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
        expect(mail.html).toContain('<div>본문</div>');
        expect(mail.html).toContain('수신 거부');
        expect(mail.html).toContain(url.replace(/&/g, '&amp;'));
        expect(db.docs.get('u1')).toMatchObject({
            lastAutomatedEmailAt: '2026-11-17T01:00:00.000Z',
            lastAutomatedEmailKind: 'streakAlert',
        });
    });

    it('영어 회원에게는 영어 문구', async () => {
        const db = fakeDb();
        const transporter = fakeTransporter();
        await guard.sendGuardedMemberEmail({
            db, transporter, uid: 'u2', locale: 'en', kind: 'x', appBaseUrl: BASE, todayKst: '2026-11-17', mail: baseMail,
        });
        expect(transporter.sent[0].html).toContain('Unsubscribe');
        expect(transporter.sent[0].html).not.toContain('수신 거부');
    });

    it('토큰은 한 번 만들면 계속 같은 것을 쓴다', async () => {
        const db = fakeDb({ u1: { unsubscribeToken: 'keep-me-token' } });
        const transporter = fakeTransporter();
        await guard.sendGuardedMemberEmail({
            db, transporter, uid: 'u1', locale: 'ko', kind: 'x', appBaseUrl: BASE, todayKst: '2026-11-17', mail: baseMail,
        });
        expect(db.docs.get('u1').unsubscribeToken).toBe('keep-me-token');
    });

    it('상한에 걸리면 보내지 않고 기록도 바꾸지 않는다', async () => {
        const db = fakeDb({ u1: { lastAutomatedEmailAt: '2026-11-16T01:00:00.000Z' } });
        const transporter = fakeTransporter();
        const result = await guard.sendGuardedMemberEmail({
            db, transporter, uid: 'u1', locale: 'ko', kind: 'x', appBaseUrl: BASE, todayKst: '2026-11-17', mail: baseMail,
        });
        expect(result).toEqual({ sent: false, reason: 'recentlyEmailed' });
        expect(transporter.sent).toHaveLength(0);
        expect(db.docs.get('u1')).toEqual({ lastAutomatedEmailAt: '2026-11-16T01:00:00.000Z' });
    });

    it('발송이 실패하면 예외를 올리고 보낸 것으로 기록하지 않는다', async () => {
        const db = fakeDb();
        const transporter = { async sendMail() { throw new Error('smtp down'); } };
        await expect(guard.sendGuardedMemberEmail({
            db, transporter, uid: 'u1', locale: 'ko', kind: 'x', appBaseUrl: BASE, todayKst: '2026-11-17', mail: baseMail,
        })).rejects.toThrow('smtp down');
        expect(db.docs.get('u1')).toBeUndefined();
    });
});

function fakeRes() {
    const res = { statusCode: 0, body: '', headers: {} };
    res.set = (k, v) => { res.headers[k] = v; return res; };
    res.status = (code) => { res.statusCode = code; return res; };
    res.send = (body) => { res.body = body; return res; };
    return res;
}

describe('수신 거부 처리', () => {
    it('GET 은 확인 화면만 보이고 거부하지 않는다 (메일 검사기가 링크를 미리 연다)', async () => {
        const db = fakeDb({ u1: { unsubscribeToken: 'tok' } });
        const res = fakeRes();
        await guard.handleUnsubscribeRequest(db, { method: 'GET', query: { u: 'u1', t: 'tok' } }, res);
        expect(res.statusCode).toBe(200);
        expect(res.body).toContain('method="post"');
        expect(db.docs.get('u1').emailOptOut).toBeUndefined();
    });

    it('Gmail 원클릭 POST 로 거부된다', async () => {
        const db = fakeDb({ u1: { unsubscribeToken: 'tok' } });
        const res = fakeRes();
        await guard.handleUnsubscribeRequest(db, {
            method: 'POST', query: { u: 'u1', t: 'tok' }, body: { 'List-Unsubscribe': 'One-Click' },
        }, res);
        expect(res.statusCode).toBe(200);
        expect(db.docs.get('u1')).toMatchObject({ emailOptOut: true, emailOptOutSource: 'one-click' });
    });

    it('버튼 POST 로도 거부되고, 그 뒤로는 메일이 나가지 않는다', async () => {
        const db = fakeDb({ u1: { unsubscribeToken: 'tok' } });
        await guard.handleUnsubscribeRequest(db, { method: 'POST', query: { u: 'u1', t: 'tok' }, body: {} }, fakeRes());
        expect(db.docs.get('u1').emailOptOutSource).toBe('link');
        const transporter = fakeTransporter();
        const result = await guard.sendGuardedMemberEmail({
            db, transporter, uid: 'u1', locale: 'ko', kind: 'x', appBaseUrl: BASE, todayKst: '2026-12-31', mail: baseMail,
        });
        expect(result).toEqual({ sent: false, reason: 'optedOut' });
        expect(transporter.sent).toHaveLength(0);
    });

    it('토큰이 틀리면 거부하지 않는다', async () => {
        const db = fakeDb({ u1: { unsubscribeToken: 'tok' } });
        const res = fakeRes();
        await guard.handleUnsubscribeRequest(db, { method: 'POST', query: { u: 'u1', t: 'tox' }, body: {} }, res);
        expect(res.statusCode).toBe(400);
        expect(db.docs.get('u1').emailOptOut).toBeUndefined();
    });

    it('토큰이 없는 회원(메일을 받은 적 없음)은 아무 토큰으로도 거부되지 않는다', async () => {
        const db = fakeDb({ u1: {} });
        const res = fakeRes();
        await guard.handleUnsubscribeRequest(db, { method: 'POST', query: { u: 'u1', t: '' }, body: {} }, res);
        expect(res.statusCode).toBe(400);
        expect(t.tokensMatch(undefined, '')).toBe(false);
    });
});

describe('연결', () => {
    const runtime = readRepoFile('functions/runtime.js');

    it('회원 메일은 전부 관문을 거친다. 직접 보내는 곳은 관리자에게 가는 버그 신고 알림 하나뿐', () => {
        const direct = runtime.match(/transporter\.sendMail\(/g) || [];
        expect(direct).toHaveLength(1);
        const index = runtime.indexOf('transporter.sendMail(');
        // 바로 앞에 있는 exports 가 버그 신고 알림이어야 한다.
        const owner = runtime.lastIndexOf('exports.', index);
        expect(runtime.startsWith('exports.notifyNewBugReport', owner)).toBe(true);
        expect((runtime.match(/sendGuardedMemberEmail\(\{/g) || []).length).toBe(6);
    });

    it('/unsubscribe 가 함수로 연결돼 있다', () => {
        const config = JSON.parse(readRepoFile('firebase.json'));
        const hosting = Array.isArray(config.hosting) ? config.hosting : [config.hosting];
        const rewrite = hosting.flatMap((h) => h.rewrites || []).find((r) => r.source === '/unsubscribe');
        expect(rewrite?.function).toEqual({ functionId: 'emailUnsubscribe', region: 'asia-northeast3' });
        expect(runtime).toContain('exports.emailUnsubscribe = onRequest(');
    });
});
