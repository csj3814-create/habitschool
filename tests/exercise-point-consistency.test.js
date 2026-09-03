import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appSource = readFileSync(path.resolve(__dirname, '../js/app-core.js'), 'utf8');

describe('exercise point consistency', () => {
    it('counts 8000+ entered steps as one optimistic cardio credit', () => {
        expect(appSource).toContain('+ (hasStepPointCredit(logData?.steps) ? 1 : 0)');
    });

    it('explains the 8000-step point rule', () => {
        // 화면은 '유산소/근력' 대신 '걸음수·이미지 / 영상' 으로 말한다 —
        // 점수가 갈리는 기준이 운동 종류가 아니라 올린 것의 종류이기 때문이다.
        expect(appSource).toContain('걸음수는 8,000보부터 운동 인증 1회로 반영돼요.');
        expect(appSource).toContain('저장하면 걸음수도 포인트에 반영돼요.');
        expect(appSource).toContain('8,000+ steps count as one exercise credit.');
    });

    it('renders authoritative exercise points even while preserving local media UI', () => {
        expect(appSource).toContain('const authoritativeExercisePoints = Number(awarded.exercisePoints || 0);');
        expect(appSource).toContain("exerciseQuestEl.className = authoritativeExercisePoints > 0 ? 'quest-check done' : 'quest-check';");
        expect(appSource).toContain('data.rewardLedgerVersion !== 3');
    });

    it('reconciles again after background media settlement', () => {
        expect(appSource).toContain('function reconcileSettlementAfterBackgroundSave');
        expect(appSource).toContain('reconcileSettlementAfterBackgroundSave(user.uid, docId, selectedDateStr);');
    });
});
