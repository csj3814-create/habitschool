import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readRepoFile = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');

// AI 분석 결과는 저장 버튼과 무관하게 그 자리에서 daily_logs 에 남는다. 그런데 그
// 쓰기들이 userId·date 없이 merge 하고 있었다. firestore.rules 의 isValidDailyLog 가
// 둘을 요구하므로, 그날 첫 동작이 분석이면(문서가 아직 없으면) 생성이 거부된다.
// 2026-08-15 consents 사고와 같은 부류다 — 화면은 멀쩡하고 아무것도 안 남는다.
describe('analysis writes can create the day document they merge into', () => {
    const source = readRepoFile('js/app-core.js');
    const rules = readRepoFile('firestore.rules');

    it('the rule really does require both fields', () => {
        expect(rules).toContain('data.userId is string');
        expect(rules).toContain("data.date.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')");
    });

    it('the diet analysis write carries userId and date', () => {
        const block = source
            .split('async function persistAnalyzedDietPhotoAndResult(')[1]
            .split('const cachedData')[0];
        expect(block).toContain('userId: user.uid,');
        expect(block).toContain('date: resolvedDateStr,');
    });

    it('the diet write still has a date when the caller forgets to pass one', () => {
        const block = source
            .split('async function persistAnalyzedDietPhotoAndResult(')[1]
            .split('const cachedData')[0];
        // docId 는 `${uid}_${date}` 라 거기서 되찾을 수 있다.
        expect(block).toContain("String(docId).split('_').slice(1).join('_')");
    });

    it('the caller passes the selected date explicitly', () => {
        expect(source).toContain('dateStr: selectedDateStr,');
    });

    it('the sleep analysis write carries them too', () => {
        const block = source
            .split('const sleepPayload = { sleepAnalysis: analysis };')[1]
            .split('const cachedData')[0];
        expect(block).toContain('userId: user.uid,');
        expect(block).toContain('date: selectedDateStr,');
    });
});
