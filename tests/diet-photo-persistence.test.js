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

    it('clears the removed marker when a diet photo slot receives a replacement file', () => {
        const appSource = readAppSource();
        const previewStaticStart = appSource.indexOf('window.previewStaticImage = function');
        const renderStart = appSource.indexOf('const render = () => {', previewStaticStart);
        const uploadStart = appSource.indexOf('if (auth?.currentUser && input.id)', renderStart);
        const renderPrelude = appSource.slice(renderStart, uploadStart);

        expect(previewStaticStart).toBeGreaterThan(-1);
        expect(renderStart).toBeGreaterThan(previewStaticStart);
        expect(renderPrelude).toContain("preview.removeAttribute('data-user-removed');");
        expect(renderPrelude).toContain("preview.removeAttribute('data-saved-url');");
        expect(renderPrelude).toContain("preview.removeAttribute('data-saved-thumb-url');");
    });

    it('preserves local meal previews while camera or file picker recovery is still settling', () => {
        const appSource = readAppSource();

        expect(appSource).toContain('const MEDIA_PICKER_RECOVERY_GRACE_MS = 12000;');
        expect(appSource).toContain("const MEDIA_PICKER_RECOVERY_STORAGE_KEY = 'habitschool-media-picker-recovery-v1';");
        expect(appSource).toContain('window.markHabitschoolMediaPickerActivity = markHabitschoolMediaPickerActivity;');
        expect(appSource).toContain("preview.setAttribute('data-local-draft', 'true');");
        expect(appSource).toContain('function shouldPreserveDailyLogMediaUi');
        expect(appSource).toContain('clearInputs({ preserveMedia: preserveLocalMediaUi });');
        expect(appSource).toContain('if (preserveLocalMediaUi && shouldSkipDietHydrationForLocalDraft(k, previewEl)) return;');
    });

    it('keeps pending upload slots from being overwritten by daily-log hydration', () => {
        const appSource = readAppSource();

        expect(appSource).toContain('function hasLocalMediaDraftForInput');
        expect(appSource).toContain('const pendingSnapshot = inputId ? getPendingUploadSnapshot(inputId) : null;');
        expect(appSource).toContain('function hasLocalExerciseMediaDraft');
        expect(appSource).toContain('if (!preserveLocalMediaUi && data.exercise)');
        expect(appSource).toContain("previewEl.removeAttribute('data-local-draft');");
    });

    it('persists Samsung Internet camera recovery across page restore before auth settles', () => {
        const appSource = readAppSource();

        expect(appSource).toContain('const MEDIA_PICKER_CAMERA_GRACE_MS = 5 * 60 * 1000;');
        expect(appSource).toContain('const MEDIA_PICKER_CAMERA_RETURN_GRACE_MS = 45000;');
        expect(appSource).toContain('function readMediaPickerRecoveryMarker');
        expect(appSource).toContain('function writeMediaPickerRecoveryMarker');
        expect(appSource).toContain('treatFreshCameraAsReturn: true');
        expect(appSource).toContain('source: normalizedSource');
        expect(appSource).toContain('returnSeen: false');
        expect(appSource).toContain('graceMs: openingGraceMs');
        expect(appSource).toContain('returnSeen: true');
        expect(appSource).toContain('graceMs: returnGraceMs');
        expect(appSource).toContain("input.addEventListener('change', finishPickerReturn");
    });
});
