import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAnalysisSleepHours, calculateLE8Score } from '../js/le8-score.js';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readRepoFile = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');

// 2026-09-11 제보: "수면 AI 분석 했는데도 수면시간이 안 들어감".
// 분석 카드에는 "8시간 20분" 이 떠 있는데 입력칸만 비어 있었다. 분석은 누르는 즉시
// Firestore 에 남지만 시간은 저장 버튼을 눌러야 남는다. 그래서 화면을 다시 그리는
// 순간 복원 경로가 빈 값으로 덮어썼다.
describe('resolveAnalysisSleepHours', () => {
    it('prefers the numeric field the server is asked to send', () => {
        expect(resolveAnalysisSleepHours({ details: { sleepHours: 7.5 } })).toBe(7.5);
        expect(resolveAnalysisSleepHours({ details: { sleepHours: '7.5' } })).toBe(7.5);
    });

    it('falls back to the Korean duration the card actually renders', () => {
        // 카드가 보여주는 값은 details.sleepDuration 이다. 숫자 필드가 빠져도
        // 화면에 8시간 20분 이 보이는 이상 입력칸이 비어 있을 이유가 없다.
        const hours = resolveAnalysisSleepHours({ details: { sleepDuration: '8시간 20분' } });
        expect(hours).toBeCloseTo(8 + 20 / 60, 5);
    });

    it('handles the other shapes the parser already knew', () => {
        expect(resolveAnalysisSleepHours({ details: { sleepDuration: '7h 30m' } })).toBeCloseTo(7.5, 5);
        expect(resolveAnalysisSleepHours({ details: { sleepDuration: '7:30' } })).toBeCloseTo(7.5, 5);
    });

    it('returns null when there is nothing to read', () => {
        expect(resolveAnalysisSleepHours(null)).toBeNull();
        expect(resolveAnalysisSleepHours({})).toBeNull();
        expect(resolveAnalysisSleepHours({ details: {} })).toBeNull();
        expect(resolveAnalysisSleepHours({ details: { sleepDuration: null } })).toBeNull();
    });
});

describe('the score and the input box read the same rule', () => {
    // 규칙이 갈라져 있던 것이 이 버그의 뿌리다. 점수는 sleepDuration 까지 읽고
    // 입력칸은 sleepHours 만 읽었다. 두 곳이 같은 함수를 쓰는지 소스로 고정한다.
    it('app-core fills the input through resolveAnalysisSleepHours, not its own parse', () => {
        const source = readRepoFile('js/app-core.js');

        expect(source).toContain('resolveAnalysisSleepHours');
        // 예전의 한 겹짜리 읽기로 돌아가지 않는다.
        expect(source).not.toContain("parseFloat(analysis?.details?.sleepHours)");
    });

    it('restores the input from the analysis when nothing was saved', () => {
        const source = readRepoFile('js/app-core.js');
        expect(source).toContain(
            '? toSleepHoursInputValue(resolveAnalysisSleepHours(data.sleepAndMind.sleepAnalysis))'
        );
    });

    it('keeps a saved zero instead of treating it as missing', () => {
        const source = readRepoFile('js/app-core.js');
        expect(source).toContain('(savedHours === null || savedHours === undefined)');
    });

    it('still scores sleep from a duration string alone', () => {
        const logs = [
            { sleepAndMind: { sleepAnalysis: { details: { sleepDuration: '8시간 20분' } } } },
            { sleepAndMind: { sleepAnalysis: { details: { sleepDuration: '7시간 40분' } } } }
        ];
        const result = calculateLE8Score({}, logs, {}, null);
        expect(result.behaviors.sleep.missing).toBeFalsy();
        expect(result.behaviors.sleep.score).toBeGreaterThan(0);
        expect(result.behaviors.sleep.avgHours).toBeCloseTo(8, 1);
        // 직접 입력이 아니라 분석에서 왔다는 표시가 남아야 한다.
        expect(result.behaviors.sleep.proxy).toBe(true);
    });
});
