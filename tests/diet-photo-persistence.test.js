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

    it('opens image uploads through the native file input path', () => {
        const appSource = readAppSource();

        expect(appSource).toContain("const DIET_LIBRARY_IMAGE_ACCEPT = 'image/*,.jpg,.jpeg,.png,.webp,.heic,.heif';");
        expect(appSource).toContain('const DIET_LIBRARY_IMAGE_EXTENSIONS = Object.freeze');
        expect(appSource).toContain('function getNativeMediaInputConfig');
        expect(appSource).toContain('function openDietSlotWithInputFallback');
        expect(appSource).not.toContain("return !/Android|SamsungBrowser/i.test(ua);");
        expect(appSource).toContain('return openDietSlotWithInputFallback(input, normalizedSource, returnGraceMs);');
        expect(appSource).toContain("openExerciseNativeInputPicker(input, 'image');");
        expect(appSource).toContain("input.setAttribute('accept', DIET_LIBRARY_IMAGE_ACCEPT);");
        expect(appSource).toContain("input.removeAttribute('capture');");
        expect(appSource).toContain("input.setAttribute('data-picker-temporary-visible', 'true');");
        expect(appSource).toContain("input.style.display = 'block';");
        expect(appSource).not.toContain('window.showOpenFilePicker');
        expect(appSource).not.toContain('openDietSlotWithSystemImagePicker');
        expect(appSource).not.toContain('openSamsungSystemMediaPicker');
        expect(appSource).not.toContain('samsungSystemPickerFallback');
    });

    it('keeps library photo picker on the native input path without permission fallback UI', () => {
        const appSource = readAppSource();

        expect(appSource).toContain('function openDietSlotWithInputFallback');
        expect(appSource).toContain('return openDietSlotWithInputFallback(input, normalizedSource, returnGraceMs);');
        expect(appSource).toContain("input.setAttribute('accept', DIET_LIBRARY_IMAGE_ACCEPT);");
        expect(appSource).toContain("input.removeAttribute('capture');");
        expect(appSource).toContain("input.setAttribute('data-picker-temporary-visible', 'true');");
        expect(appSource).toContain('input.click();');
        expect(appSource).not.toContain('showDietLibraryPickerFallback({ input, slot, returnGraceMs');
        expect(appSource).not.toContain('window.showOpenFilePicker');
    });

    it('routes exercise and sleep media pickers through native inputs by media kind', () => {
        const appSource = readAppSource();
        const indexSource = readRepoFile('index.html');

        expect(appSource).toContain("const EXERCISE_LIBRARY_VIDEO_ACCEPT = 'video/*,.mp4,.mov,.webm,.m4v,.3gp,.3gpp,.avi,.mkv,.mpeg,.mpg';");
        expect(appSource).toContain('const EXERCISE_LIBRARY_VIDEO_EXTENSIONS = Object.freeze');
        expect(appSource).toContain('const EXERCISE_LIBRARY_GENERIC_VIDEO_TYPES = Object.freeze');
        expect(appSource).toContain('const EXERCISE_LIBRARY_VIDEO_COMPAT_TYPES = Object.freeze');
        expect(appSource).toContain('const EXERCISE_VIDEO_FALLBACK_MESSAGE =');
        expect(appSource).toContain('function getNativeMediaInputConfig');
        expect(appSource).toContain('function openExerciseNativeInputPicker');
        expect(appSource).toContain('function getSelectedMediaFile(input)');
        expect(appSource).toContain('noFileMessage: EXERCISE_VIDEO_FALLBACK_MESSAGE');
        expect(appSource).toContain('function isGenericExerciseVideoPickerFile');
        expect(appSource).toContain('EXERCISE_LIBRARY_GENERIC_VIDEO_TYPES.includes(type)');
        expect(appSource).not.toContain('window.showOpenFilePicker');
        expect(appSource).not.toContain('function openSamsungExerciseVideoSystemPicker');
        expect(appSource).not.toContain('function shouldUseSamsungSystemVideoPicker');
        expect(appSource).not.toContain('function openSamsungSystemMediaPicker');
        expect(appSource).not.toContain('samsungSystemVideoPickerFallback');
        expect(appSource).toContain("onclick=\"return openExerciseMediaPicker(event, 'file_c_${id}', 'image')\"");
        expect(appSource).toContain("onclick=\"return openExerciseMediaPicker(event, 'file_s_${id}', 'video')\"");
        expect(appSource).toContain('window.addCardioBlockWithFile = function(event)');
        expect(appSource).toContain('window.addStrengthBlockWithFile = function(event)');
        expect(appSource).toContain("openExerciseMediaInput(reusableInput, 'image', event);");
        expect(appSource).toContain("openExerciseMediaInput(innerInput, 'video', event);");
        expect(appSource).toContain('function openExerciseMediaInput');
        expect(appSource).toContain('window.openSleepImagePicker = function');
        expect(appSource).toContain('prepareNativeMediaInput(input, mediaKind);');
        expect(appSource).toContain('return openExerciseNativeInputPicker(input, normalizedKind);');
        expect(appSource).toContain('input.click();');
        expect(appSource).not.toContain("startIn: 'videos'");
        expect(appSource).not.toContain('id: config.pickerId');
        expect(appSource).toContain('if (event?.target === input) return true;');
        expect(indexSource).toContain('onclick="addCardioBlockWithFile(event)"');
        expect(indexSource).toContain('onclick="addStrengthBlockWithFile(event)"');
        expect(indexSource).toContain('onclick="openSleepImagePicker(event)"');
    });
});
