import { describe, expect, it } from 'vitest';
import { readAppSource, readRepoFile } from './source-helpers.js';

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

        expect(appSource).toContain('function shouldQueueSelectedFileForOfflineOutbox');
        expect(appSource).toContain('const pendingSnapshot = getPendingUploadSnapshot(input?.id);');
        expect(appSource).toContain('!hasMediaUrl(pendingSnapshot?.result?.url)');
        expect(appSource).toContain('shouldQueueSelectedFileForOfflineOutbox({');
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
        expect(appSource).toContain('const MEDIA_PICKER_CAMERA_RETURN_GRACE_MS = 90 * 1000;');
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

    it('uses the system image picker only for Samsung Internet library uploads', () => {
        const appSource = readAppSource();

        expect(appSource).toContain("const DIET_LIBRARY_IMAGE_ACCEPT = 'image/*,.jpg,.jpeg,.png,.webp,.heic,.heif';");
        expect(appSource).toContain('const DIET_LIBRARY_IMAGE_EXTENSIONS = Object.freeze');
        expect(appSource).toContain('isSamsungInternetUserAgent');
        expect(appSource).toContain('function shouldUseSystemImagePickerForDietLibrary');
        expect(appSource).toContain("return shouldUseSamsungSystemMediaPicker(input, 'image');");
        expect(appSource).toContain('function shouldUseSamsungSystemMediaPicker');
        expect(appSource).toContain("if (!isSamsungInternetUserAgent(navigator.userAgent || navigator.vendor || '')) return false;");
        expect(appSource).not.toContain("return !/Android|SamsungBrowser/i.test(ua);");
        expect(appSource).toContain('function openDietSlotWithSystemImagePicker');
        expect(appSource).toContain('if (!shouldUseSystemImagePickerForDietLibrary(input)) return false;');
        expect(appSource).toContain('excludeAcceptAllOption: true');
        expect(appSource).toContain("accept: { 'image/*': DIET_LIBRARY_IMAGE_EXTENSIONS }");
        expect(appSource).toContain('applySharedImageToStaticInput(input.id, previewId, removeId, [file], false)');
        expect(appSource).toContain("input.setAttribute('accept', DIET_LIBRARY_IMAGE_ACCEPT);");
        expect(appSource).toContain("input.removeAttribute('capture');");
        expect(appSource).toContain("input.setAttribute('data-picker-temporary-visible', 'true');");
        expect(appSource).toContain("input.style.display = 'block';");
    });

    it('keeps Android picker fallback clicks inside a fresh user tap after permission denial', () => {
        const appSource = readAppSource();

        expect(appSource).toContain('function getDietLibraryPickerFailureReason');
        expect(appSource).toContain('function showDietLibraryPickerFallback');
        expect(appSource).toContain("data-action=\"fallback-input\"");
        expect(appSource).toContain("data-action=\"camera\"");
        expect(appSource).toContain("openDietSlotWithInputFallback(liveInput, 'library'");
        expect(appSource).toContain('showDietLibraryPickerFallback({ input, slot, returnGraceMs, reason });');
        expect(appSource).not.toContain("openDietSlotWithInputFallback(input, 'library', returnGraceMs);");
        expect(appSource).not.toContain('file input으로 전환합니다');
    });

    it('routes Samsung Internet exercise and sleep media pickers by media kind', () => {
        const appSource = readAppSource();
        const indexSource = readRepoFile('index.html');

        expect(appSource).toContain("const EXERCISE_LIBRARY_VIDEO_ACCEPT = 'video/*,.mp4,.mov,.webm,.m4v,.3gp,.3gpp';");
        expect(appSource).toContain('const EXERCISE_LIBRARY_VIDEO_EXTENSIONS = Object.freeze');
        expect(appSource).toContain('function getSamsungSystemPickerMediaConfig');
        expect(appSource).toContain("accept: { 'video/*': EXERCISE_LIBRARY_VIDEO_EXTENSIONS }");
        expect(appSource).toContain("onclick=\"return openExerciseMediaPicker(event, 'file_c_${id}', 'image')\"");
        expect(appSource).toContain("onclick=\"return openExerciseMediaPicker(event, 'file_s_${id}', 'video')\"");
        expect(appSource).toContain('window.openSleepImagePicker = function');
        expect(appSource).toContain("applySharedImageToStaticInput('sleep-img', 'preview-sleep', 'rm-sleep'");
        expect(appSource).toContain('function applyPickedVideoToExerciseInput');
        expect(appSource).toContain('window.previewDynamicVid?.(input);');
        expect(appSource).toContain('if (event?.target === input) return true;');
        expect(indexSource).toContain('onclick="openSleepImagePicker(event)"');
    });
});
