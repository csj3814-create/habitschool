import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { evaluateAutoGroupRecord, isAutoApprovedGroup } = require('../functions/group-auto-checkin.js');
const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtime = readFileSync(resolve(ROOT_DIR, 'functions/runtime.js'), 'utf8');

const STEPS = { kind: 'steps', minSteps: 10000 };
const RECORD = { kind: 'exercise_record' };
const photo = (analysis) => ({ imageUrl: 'https://x/p.jpg', ...(analysis === undefined ? {} : { aiAnalysis: analysis }) });

// 2026-11-08 대표: 소모임 승인을 서버가 한다. 기준을 넘지 못한 날은 대기로 남아 사람이 본다.
describe('habit group auto approval', () => {
    it('approves 10,000 steps that came from Health Connect or a step capture', () => {
        expect(evaluateAutoGroupRecord({ steps: { count: 10500, source: 'health_connect' } }, STEPS).qualified).toBe(true);
        expect(evaluateAutoGroupRecord({ steps: { count: 12000, source: 'samsung_screenshot', screenshotUrl: 'https://x/s.jpg' } }, STEPS).qualified).toBe(true);
    });

    it('leaves typed-in steps and short days to a person', () => {
        expect(evaluateAutoGroupRecord({ steps: { count: 15000, source: 'manual' } }, STEPS)).toMatchObject({ qualified: false, reason: 'manual_steps' });
        expect(evaluateAutoGroupRecord({ steps: { count: 15000 } }, STEPS)).toMatchObject({ qualified: false, reason: 'manual_steps' });
        expect(evaluateAutoGroupRecord({ steps: { count: 9999, source: 'health_connect' } }, STEPS)).toMatchObject({ qualified: false, reason: 'short_steps' });
    });

    it('approves a day with a photo or video the AI judged as exercise', () => {
        expect(evaluateAutoGroupRecord({ exercise: { cardioList: [photo({ isExercise: true, exerciseType: '계단 오르기' })] } }, RECORD)).toMatchObject({ qualified: true, summary: '계단 오르기' });
        expect(evaluateAutoGroupRecord({ exercise: { strengthList: [{ videoUrl: 'https://x/v.mp4', aiAnalysis: { isExercise: true, exerciseType: '스쿼트' } }] } }, RECORD).qualified).toBe(true);
    });

    it('does not approve a photo the AI did not call exercise, or one still waiting for analysis', () => {
        expect(evaluateAutoGroupRecord({ exercise: { cardioList: [photo({ isExercise: false })] } }, RECORD)).toMatchObject({ qualified: false, reason: 'not_exercise' });
        expect(evaluateAutoGroupRecord({ exercise: { cardioList: [photo()] } }, RECORD)).toMatchObject({ qualified: false, reason: 'no_analysis' });
        // 메모·숫자만 적은 날은 사진이 없어 사람에게 남긴다.
        expect(evaluateAutoGroupRecord({ exercise: { memo: '헬스 1시간', cardioTime: 60 } }, RECORD)).toMatchObject({ qualified: false, reason: 'no_media' });
    });

    it('covers every group except the running group, which has its own rule', () => {
        expect(isAutoApprovedGroup({ requirement: STEPS })).toBe(true);
        expect(isAutoApprovedGroup({ requirement: RECORD })).toBe(true);
        expect(isAutoApprovedGroup({ requirement: { kind: 'running' } })).toBe(false);
    });

    it('only turns pending into approved, never touches what a person decided', () => {
        const fn = runtime.split('async function approveAutoGroupCheckin(')[1].split('exports.syncRunningGroupCheckin')[0];
        expect(fn).toContain('if (String(checkin.reviewStatus || "") !== "pending") return false;');
        expect(fn).toContain('reviewedBy: "auto_group_rule"');
        expect(fn).not.toContain('"rejected"');
    });

    it('runs when the app writes a pending check-in and when the day record changes later', () => {
        const trigger = runtime.split('exports.onHabitGroupCheckinWritten = onDocumentWritten(')[1].split('exports.')[0];
        expect(trigger).toContain('if (after?.reviewStatus === "pending")');
        expect(trigger).toContain('await approveAutoGroupCheckin(event.data.after.ref)');
        const sync = runtime.split('exports.syncRunningGroupCheckin = onDocumentWritten(')[1].split('// ====')[0];
        expect(sync).toContain('const stepsChanged =');
        expect(sync).toContain('await approveAutoGroupCheckin(checkinRef)');
    });
});
