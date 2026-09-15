import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    buildAdminPrescriptionDrafts,
    ADMIN_PRESCRIPTION_SCORE_FLOOR,
} from '../js/admin-utils.js';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN = readFileSync(resolve(ROOT_DIR, 'admin.html'), 'utf8');
const TODAY = '2026-09-15';

// 하루치 완전 기록 — 빈 자리 초안이 끼어들어 순위 시험을 흐리지 않게 한다.
const FULL_DAY = { date: TODAY, diet: { breakfastUrl: 'x' }, steps: { count: 9000 }, sleepAndMind: { sleepHours: 7 } };

const stepsTrend = (previous, recent, extra = {}) => ({
    key: 'steps', label: '걸음수', unit: '보', decimals: 0, ...extra,
    summary: { recent, previous, delta: recent - previous, direction: recent > previous ? 'improved' : 'worsened' },
});

const scoreOf = (drafts, keyPart) => drafts.find((d) => d.key.includes(keyPart))?.score;

// 2026-09-15 요청: "7일에 한번정도로 다이렉트 처방 중에서 가장 의미있는 정보부터"
//
// 그때까지 순위는 종류 순서(경보→나빠짐→좋아짐→꾸준함→빈자리→복귀)가 전부였다.
// 걸음수가 100보 늘어난 사람과 3,000보 늘어난 사람이 같은 자리를 받았다.
describe('drafts are ranked by how much they actually matter', () => {
    it('ranks a big change above a small one of the same kind', () => {
        const small = buildAdminPrescriptionDrafts({
            logs: [FULL_DAY], todayStr: TODAY, trendMetrics: [stepsTrend(7200, 7800)],
        });
        const big = buildAdminPrescriptionDrafts({
            logs: [FULL_DAY], todayStr: TODAY, trendMetrics: [stepsTrend(7200, 10200)],
        });
        expect(scoreOf(big, 'improved')).toBeGreaterThan(scoreOf(small, 'improved'));
    });

    it('measures the change against the member, not in raw units', () => {
        // 걸음수 2,000보와 수면 0.5시간은 절대값으로 견줄 수 없다. 같은 비율로
        // 움직였으면 같은 크기 점수를 받아야 지표를 가로질러 비교된다.
        const steps = buildAdminPrescriptionDrafts({
            logs: [FULL_DAY], todayStr: TODAY, trendMetrics: [stepsTrend(8000, 9600)], // +20%
        });
        const sleep = buildAdminPrescriptionDrafts({
            logs: [FULL_DAY], todayStr: TODAY,
            trendMetrics: [{
                key: 'sleepHours', label: '수면', unit: '시간', decimals: 1,
                summary: { recent: 7.2, previous: 6.0, delta: 1.2, direction: 'improved' }, // +20%
            }],
        });
        expect(scoreOf(steps, 'improved')).toBe(scoreOf(sleep, 'improved'));
    });

    it('hands back the list already in order', () => {
        const drafts = buildAdminPrescriptionDrafts({
            name: '루미나', streak: 157, todayStr: TODAY,
            logs: [{ date: '2026-09-12', metrics: { glucose: 141 } }],
            trendMetrics: [stepsTrend(7200, 9549, { percentile: 79 })],
        });
        const scores = drafts.map((d) => d.score);
        expect(scores).toEqual([...scores].sort((a, b) => b - a));
    });
});

describe('a bigger number never outranks a more urgent kind', () => {
    it('keeps a reading over the line on top of any amount of praise', () => {
        // 걸음수가 아무리 늘어도 혈당 경보를 밀어내면 안 된다. 바닥 점수를
        // 겹치지 않게 띄워 둔 이유가 이것이다.
        const drafts = buildAdminPrescriptionDrafts({
            logs: [{ date: '2026-09-12', metrics: { glucose: 141 } }],
            todayStr: TODAY,
            trendMetrics: [stepsTrend(1000, 20000)], // 2000% 개선
        });
        expect(drafts[0].key).toContain('alert');
        expect(scoreOf(drafts, 'alert')).toBeGreaterThan(scoreOf(drafts, 'improved'));
    });

    it('puts a worsening reading above an improving one', () => {
        const drafts = buildAdminPrescriptionDrafts({
            logs: [FULL_DAY], todayStr: TODAY,
            trendMetrics: [
                stepsTrend(7200, 10800), // +50% 개선
                { key: 'glucose', label: '공복혈당', unit: 'mg/dL', decimals: 0,
                  summary: { recent: 118, previous: 110, delta: 8, direction: 'worsened' } }, // +7% 악화
            ],
        });
        expect(scoreOf(drafts, 'worsened')).toBeGreaterThan(scoreOf(drafts, 'improved'));
    });

    it('reads a reading far over the line as more urgent than one just over it', () => {
        const just = buildAdminPrescriptionDrafts({
            logs: [{ date: '2026-09-12', metrics: { glucose: 127 } }], todayStr: TODAY,
        });
        const far = buildAdminPrescriptionDrafts({
            logs: [{ date: '2026-09-12', metrics: { glucose: 190 } }], todayStr: TODAY,
        });
        expect(scoreOf(far, 'alert')).toBeGreaterThan(scoreOf(just, 'alert'));
    });

    it('reads a repeated reading as more urgent than a single one', () => {
        const once = buildAdminPrescriptionDrafts({
            logs: [{ date: '2026-09-12', metrics: { glucose: 141 } }], todayStr: TODAY,
        });
        const often = buildAdminPrescriptionDrafts({
            logs: ['09-05', '09-08', '09-12'].map((d) => ({ date: `2026-${d}`, metrics: { glucose: 141 } })),
            todayStr: TODAY,
        });
        expect(scoreOf(often, 'alert')).toBeGreaterThan(scoreOf(once, 'alert'));
    });
});

describe('a measured reading is never sent without a person reading it first', () => {
    it('marks alert drafts as needing a human', () => {
        const drafts = buildAdminPrescriptionDrafts({
            logs: [{ date: '2026-09-12', metrics: { glucose: 141 } }], todayStr: TODAY,
        });
        expect(drafts.find((d) => d.key.includes('alert')).requiresHuman).toBe(true);
    });

    it('marks nothing else that way — the rest are ordinary coaching', () => {
        const drafts = buildAdminPrescriptionDrafts({
            name: '루미나', streak: 157, logs: [FULL_DAY], todayStr: TODAY,
            trendMetrics: [stepsTrend(7200, 9549)],
        });
        expect(drafts.length).toBeGreaterThan(0);
        for (const draft of drafts) {
            expect(draft.requiresHuman, draft.key).toBeFalsy();
        }
    });
});

describe('a score that means nothing is not offered at all', () => {
    it('keeps every returned draft at or above the floor', () => {
        const drafts = buildAdminPrescriptionDrafts({
            name: '루미나', streak: 7, logs: [FULL_DAY], todayStr: TODAY,
            trendMetrics: [stepsTrend(7200, 7400)],
        });
        for (const draft of drafts) {
            expect(draft.score, draft.key).toBeGreaterThanOrEqual(ADMIN_PRESCRIPTION_SCORE_FLOOR);
            expect(draft.score, draft.key).toBeLessThanOrEqual(100);
        }
    });

    it('still returns nothing at all for a member with no record', () => {
        expect(buildAdminPrescriptionDrafts({ logs: [], todayStr: TODAY })).toEqual([]);
    });
});

describe('the admin can see why a draft ranked where it did', () => {
    it('shows the score and flags the ones a person must read', () => {
        const fn = ADMIN.split('function renderPrescriptionDrafts(')[1].split('\n    }\n')[0];
        expect(fn).toContain('rx-draft-score');
        expect(fn).toContain("draft.requiresHuman ? '<span class=\"rx-draft-human\"");
        expect(ADMIN).toContain('.rx-draft-score {');
        expect(ADMIN).toContain('.rx-draft-human {');
    });
});
