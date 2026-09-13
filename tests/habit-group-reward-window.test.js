import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarizeHabitGroupProgress, EXERCISE_GROUP_REWARD_WINDOW_DAYS } from '../js/habit-groups.js';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');

// 100회는 아무 때나 채우면 되는 것이 아니라 120일 창 안에서 채워야 3,000P 가 나온다.
// 카드가 창을 말해 주지 않아서, 남은 날이 얼마인지 알 방법이 없었다.
describe('a habit group shows the window its 100 days must fit in', () => {
    it('carries the window through the summary', () => {
        const s = summarizeHabitGroupProgress(
            { startedDate: '2026-09-01', windowEndDate: '2026-12-29', approvedCount: 12, submittedCount: 12 },
            '2026-09-14'
        );
        expect(s.startedDate).toBe('2026-09-01');
        expect(s.windowEndDate).toBe('2026-12-29');
        expect(s.windowDaysLeft).toBe(107); // 9/14 부터 12/29 까지, 끝나는 날 포함
        expect(s.windowExpired).toBe(false);
    });

    it('counts the last day as still inside the window', () => {
        const s = summarizeHabitGroupProgress(
            { startedDate: '2026-09-01', windowEndDate: '2026-12-29' },
            '2026-12-29'
        );
        expect(s.windowDaysLeft).toBe(1);
        expect(s.windowExpired).toBe(false);
    });

    it('calls it over the day after', () => {
        const s = summarizeHabitGroupProgress(
            { startedDate: '2026-09-01', windowEndDate: '2026-12-29' },
            '2026-12-30'
        );
        expect(s.windowDaysLeft).toBe(0);
        expect(s.windowExpired).toBe(true);
    });

    it('stays quiet when there is no window to show', () => {
        const s = summarizeHabitGroupProgress({ approvedCount: 3 }, '2026-09-14');
        expect(s.startedDate).toBe('');
        expect(s.windowDaysLeft).toBeNull();
        expect(s.windowExpired).toBe(false);
    });

    it('the window is the 120 days the server opens', () => {
        expect(EXERCISE_GROUP_REWARD_WINDOW_DAYS).toBe(120);
        const server = read('functions/runtime.js').match(/const EXERCISE_GROUP_REWARD_WINDOW_DAYS = (\d+);/);
        expect(server[1]).toBe(String(EXERCISE_GROUP_REWARD_WINDOW_DAYS));
    });

    it('both cards render the line, not just one', () => {
        const app = read('js/app-core.js');
        expect(app.split('habit-group-window-text').length - 1).toBe(2);
        expect(app).toContain('function formatHabitGroupWindowLine(');
        // 오늘이 없으면 남은 날을 셀 수 없다. 세 호출 모두 넘겨야 한다.
        expect(app.split('summarizeHabitGroupProgress(').length - 1).toBe(3);
        expect(app).not.toMatch(/summarizeHabitGroupProgress\([^)]*\{\}\)(?!,)/);
    });
});
