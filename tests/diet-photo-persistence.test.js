import { describe, expect, it } from 'vitest';
import { readAppSource } from './source-helpers.js';

describe('diet photo persistence', () => {
    it('saves the analyzed diet photo URL with the AI analysis result', () => {
        const appSource = readAppSource();

        expect(appSource).toContain('async function persistAnalyzedDietPhotoAndResult');
        expect(appSource).toContain('diet: dietPatch');
        expect(appSource).toContain('dietAnalysis: { [meal]: analysis }');
        expect(appSource).toContain('await persistAnalyzedDietPhotoAndResult({');
        expect(appSource).not.toContain(`await setDoc(doc(db, "daily_logs", docId), {
                    dietAnalysis: { [meal]: analysis }
                }, { merge: true });`);
    });

    it('does not overwrite saved diet media with empty slot values during a later save', () => {
        const appSource = readAppSource();

        expect(appSource).toContain('function mergeDietMediaWithExisting');
        expect(appSource).toContain('if (!nextUrl) return;');
        expect(appSource).toContain('const mergedDietData = mergeDietMediaWithExisting');
        expect(appSource).toContain('diet: mergedDietData');
        expect(appSource).not.toContain('breakfastUrl: bUrl, lunchUrl: lUrl, dinnerUrl: dUrl, snackUrl: sUrl,');
    });

    it('keeps a selected diet file in the offline outbox until that selected upload has a URL', () => {
        const appSource = readAppSource();

        expect(appSource).toContain('const pendingSnapshot = getPendingUploadSnapshot(input?.id);');
        expect(appSource).toContain('hasMediaUrl(pendingSnapshot?.result?.url)');
        expect(appSource).not.toContain('hasMediaUrl(diet[`${slot}Url`]) return');
    });
});
