import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
    parseArgs,
    hasMindContent,
    resolvePreservedUpdatedAt,
    createOrderPreservingWrite,
    monthWindows
} = require('../scripts/backfill-gallery-mind-2026-10-15.js');

// 2026-10-15: 감사 일기·수면 분석을 옛 게시물에도 싣는 백필. 갤러리는 updatedAt 순으로
// 받아 오므로, 옛 게시물 수천 개에 '지금' 을 찍으면 피드 맨 위로 몰린다. 순서를 지킨다.
const context = { databaseName: 'projects/p/databases/(default)' };
const plan = (overrides = {}) => ({
    action: 'upsert',
    logId: 'u1_2026-04-02',
    payload: { schemaVersion: 3, userId: 'u1', sleepAndMind: { gratitude: '감사' } },
    existingState: { exists: true, updateTime: '2026-04-02T01:00:00Z' },
    dailyLog: { date: '2026-04-02' },
    ...overrides
});

describe('갤러리 마음 칸 백필', () => {
    it('이미 있는 게시물은 원래 updatedAt 을 그대로 둔다 — 서버 시각으로 덮지 않는다', () => {
        const original = new Date('2026-04-02T01:00:00Z');
        const write = createOrderPreservingWrite(context, plan(), { updatedAt: original });
        expect(write.update.fields.updatedAt).toEqual({ timestampValue: original.toISOString() });
        expect(write.updateTransforms).toBeUndefined();
        // 그 사이 트리거가 고쳤으면 덮어쓰지 않는다
        expect(write.currentDocument).toEqual({ updateTime: '2026-04-02T01:00:00Z' });
    });

    it('새로 생기는 게시물은 그 기록의 시각, 없으면 그날 정오(KST)', () => {
        const ts = new Date('2026-04-02T12:30:00Z');
        expect(resolvePreservedUpdatedAt(null, { timestamp: ts, date: '2026-04-02' })).toEqual(ts);
        expect(resolvePreservedUpdatedAt(null, { date: '2026-04-02' }).toISOString()).toBe('2026-04-02T03:00:00.000Z');
        const write = createOrderPreservingWrite(context, plan({ existingState: { exists: false, updateTime: '' } }), null);
        expect(write.currentDocument).toEqual({ exists: false });
    });

    it('지우는 일과 바뀔 것 없는 일은 하지 않는다', () => {
        expect(createOrderPreservingWrite(context, plan({ action: 'delete' }), {})).toBeNull();
        expect(createOrderPreservingWrite(context, plan({ action: 'noop' }), {})).toBeNull();
    });

    it('감사 일기나 수면 분석이 있는 날만 손댄다', () => {
        expect(hasMindContent({ sleepAndMind: { gratitude: '감사' } })).toBe(true);
        expect(hasMindContent({ sleepAndMind: { sleepAnalysis: { grade: 'B' } } })).toBe(true);
        expect(hasMindContent({ sleepAndMind: { gratitude: '   ', meditationDone: true } })).toBe(false);
        expect(hasMindContent({ diet: {} })).toBe(false);
    });

    it('한 달씩 나눠 읽는다', () => {
        expect(monthWindows('2026-03-15', '2026-05-02')).toEqual([
            { startDate: '2026-03-15', endDate: '2026-03-31' },
            { startDate: '2026-04-01', endDate: '2026-04-30' },
            { startDate: '2026-05-01', endDate: '2026-05-02' }
        ]);
    });

    it('기본은 건조 실행이고 프로젝트를 꼭 적어야 한다', () => {
        expect(() => parseArgs([])).toThrow();
        expect(parseArgs(['--project', 'staging'])).toMatchObject({ apply: false, projectId: 'habitschool-staging', from: '2026-03-01' });
        expect(parseArgs(['--project', 'prod', '--apply']).projectId).toBe('habitschool-8497b');
    });
});
