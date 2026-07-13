import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appSource = readFileSync(path.resolve(__dirname, '../js/app-core.js'), 'utf8');

describe('exercise point consistency', () => {
    it('uses potentially verifiable step evidence instead of manual step count for optimistic points', () => {
        expect(appSource).toContain('+ (hasPotentiallyVerifiableStepEvidence(logData?.steps) ? 1 : 0)');
        expect(appSource).not.toContain('+ (stepsCount >= 8000 ? 1 : 0)');
    });

    it('explains that manual steps are record-only', () => {
        expect(appSource).toContain('수동 걸음수는 기록용이며, 포인트는 걸음 캡처 인증 시 반영돼요.');
        expect(appSource).toContain('수동 걸음수는 기록만 저장돼요.');
        expect(appSource).toContain('Manual steps are saved as a record; points require a verified step screenshot.');
    });

    it('renders authoritative exercise points even while preserving local media UI', () => {
        expect(appSource).toContain('const authoritativeExercisePoints = Number(awarded.exercisePoints || 0);');
        expect(appSource).toContain("exerciseQuestEl.className = authoritativeExercisePoints > 0 ? 'quest-check done' : 'quest-check';");
    });

    it('reconciles again after background media settlement', () => {
        expect(appSource).toContain('function reconcileSettlementAfterBackgroundSave');
        expect(appSource).toContain('reconcileSettlementAfterBackgroundSave(user.uid, docId, selectedDateStr);');
    });
});
