import { describe, expect, it } from 'vitest';
import { readAppSource } from './source-helpers.js';

describe('video upload resilience', () => {
    it('uses progress-aware resumable upload timeouts instead of a fixed 30 second cancel', () => {
        const source = readAppSource();

        expect(source).toContain("import { getResumableUploadTimeouts } from './upload-performance.js");
        expect(source).toContain('runResumableUploadWithTimeout(storageRef, fileToUpload');
        expect(source).toContain('idleTimeoutMs: uploadTimeouts.idleTimeoutMs');
        expect(source).toContain('hardTimeoutMs: uploadTimeouts.hardTimeoutMs');
        expect(source).toContain('uploadTask.cancel()');
        expect(source).not.toContain('const timeoutMs = 30000');
        expect(source).not.toContain('업로드 시간 초과. 네트워크를 확인해주세요.');
    });

    it('does not mark a tracked upload complete when the URL is missing', () => {
        const source = readAppSource();

        expect(source).toContain("if (!result?.url) {");
        expect(source).toContain("setInlineUploadProgress(inputId, { state: 'error', pct: 100 })");
        expect(source).toContain('_pendingUploads.delete(inputId)');
    });

    it('turns a stalled 0 percent pending upload into a delayed background-save state', () => {
        const source = readAppSource();

        expect(source).toContain('const INLINE_UPLOAD_STALLED_MS = 8000;');
        expect(source).toContain('function schedulePendingUploadStalledNotice');
        expect(source).toContain('업로드가 지연돼요. 저장하면 자동으로 이어갈게요.');
        expect(source).toContain("els.percentEl.textContent = state === 'error' || message ? '' : `${normalizedPct}%`;");
        expect(source).toContain('schedulePendingUploadStalledNotice(inputId, entry);');
        expect(source).toContain('clearPendingUploadDelayTimer(current);');
    });

    it('uses a simpler Samsung Internet image upload path instead of resumable progress that can stall at 1 percent', () => {
        const source = readAppSource();

        expect(source).toContain('const SAMSUNG_IMAGE_UPLOAD_SIMPLE_TIMEOUT_MS = 45 * 1000;');
        expect(source).toContain('function shouldUseSamsungSimpleImageUpload');
        expect(source).toContain('return isSamsungInternetUserAgent(ua);');
        expect(source).toContain('async function uploadSamsungImageWithSimplePut');
        expect(source).toContain('uploadBytes(storageRef, file, {');
        expect(source).toContain('samsung_image_upload_timeout');
        expect(source).toContain('const useSamsungSimpleImageUpload = shouldUseSamsungSimpleImageUpload(fileToUpload);');
        expect(source).toContain('const useSamsungSimpleUpload = useSamsungSimpleImageUpload || useSamsungSimpleVideoUpload;');
        expect(source).toContain('const maxRetries = useSamsungSimpleUpload ? 0 : 2;');
        expect(source).toContain('if (useSamsungSimpleImageUpload) {');
        expect(source).toContain('await uploadSamsungImageWithSimplePut(storageRef, fileToUpload, onProgress);');
    });

    it('uses a simpler Samsung Internet exercise video upload path instead of resumable progress that can stall at 1 percent', () => {
        const source = readAppSource();

        expect(source).toContain('const SAMSUNG_VIDEO_UPLOAD_SIMPLE_PROGRESS_LABEL');
        expect(source).toContain('function shouldUseSamsungSimpleVideoUpload');
        expect(source).toContain('async function uploadSamsungVideoWithSimplePut');
        expect(source).toContain('scheduleSimpleUploadProgress(onProgress, {');
        expect(source).toContain('message: SAMSUNG_VIDEO_UPLOAD_SIMPLE_PROGRESS_LABEL');
        expect(source).toContain('samsung_video_upload_timeout');
        expect(source).toContain('const useSamsungSimpleVideoUpload = isVideo && shouldUseSamsungSimpleVideoUpload(fileToUpload, normalizedFolderName);');
        expect(source).toContain('if (useSamsungSimpleVideoUpload) {');
        expect(source).toContain('await uploadSamsungVideoWithSimplePut(storageRef, fileToUpload, {');
        expect(source).toContain('contentType: videoContentType');
        expect(source).toContain('timeoutMs: uploadTimeouts.hardTimeoutMs');
        expect(source).toContain('function normalizeUploadProgressPayload');
        expect(source).toContain('entry.progressMessage = message;');
    });

    it('keeps large exercise video thumbnail extraction behind the original upload', () => {
        const source = readAppSource();

        expect(source).toContain('shouldDeferStrengthThumbUntilUpload');
        expect(source).toContain('if (shouldDeferStrengthThumbUntilUpload(file?.size || 0)) return null;');
        expect(source).toContain('if (localThumbPromise) {');
        expect(source).toContain('uploadOptions.thumbDataUrlPromise = localThumbPromise;');
        expect(source).toContain('const pendingUpload = uploadVideoWithThumb(file, \'exercise_videos\', auth.currentUser.uid, localThumbSeed, uploadOptions);');
    });

    it('uses object URLs for local photo previews and releases them after persistence', () => {
        const source = readAppSource();

        expect(source).toContain('function setLocalImagePreviewSource(previewEl, file)');
        expect(source).toContain('URL.createObjectURL(file)');
        expect(source).toContain("previewEl.setAttribute('data-local-preview-object-url', objectUrl);");
        expect(source).toContain('if (setLocalImagePreviewSource(preview, file)) {');
        expect(source).toContain('replaceLocalPreviewObjectUrl(previewEl, thumbUrl || url);');
        expect(source).toContain('revokeLocalPreviewObjectUrl(previewEl);');
    });

    it('treats Samsung exercise videos with generic file metadata as video uploads', () => {
        const source = readAppSource();

        expect(source).toContain('function isAcceptedExerciseVideoFile(file)');
        expect(source).toContain('function isGenericExerciseVideoPickerFile(file)');
        expect(source).toContain('function getSelectedMediaFile(input)');
        expect(source).toContain('const file = getSelectedMediaFile(input);');
        expect(source).toContain('ensureDeferredVideoUpload(fileInput.id, selectedFile, localThumbSeed);');
        expect(source).not.toContain('window.showOpenFilePicker');
        expect(source).not.toContain('_habitschoolPickedFile');
        expect(source).not.toContain('samsungSystemVideoPickerFallback');
        expect(source).toContain('const EXERCISE_LIBRARY_GENERIC_VIDEO_TYPES = Object.freeze');
        expect(source).toContain("'application/octet-stream'");
        expect(source).toContain('function isExerciseVideoUploadCandidate(file, folderName = \'\')');
        expect(source).toContain("const isExerciseVideoFolder = normalizedFolderName === 'exercise_videos';");
        expect(source).toContain('if (!isValidFileType(file) && !(isExerciseVideoFolder && isVideoUpload))');
        expect(source).toContain('const isVideo = isExerciseVideoUploadCandidate(fileToUpload, normalizedFolderName);');
        expect(source).toContain('const videoContentType = isVideo ? getExerciseVideoContentType(fileToUpload) : \'\';');
        expect(source).toContain('const uploadMetadata = isVideo ? { contentType: videoContentType } : undefined;');
        expect(source).toContain('metadata: uploadMetadata');
        expect(source).toContain('const uploadTask = uploadBytesResumable(storageRef, file, metadata);');
    });

    it('bounds the background Firestore patch after media upload reaches the final sync phase', () => {
        const source = readAppSource();

        expect(source).toContain('const BACKGROUND_MEDIA_PATCH_TIMEOUT_MS = 8000;');
        expect(source).toContain('background_media_patch_timeout');
        expect(source).toContain('function queueBackgroundMediaPatchRetry');
        expect(source).toContain('habitschool-background-media-patches-v1');
        expect(source).toContain("noteFirestoreConnectivityFailure(error, 'background media patch')");
        expect(source).toContain('flushBackgroundMediaPatchQueue({ quiet: true })');
    });

    it('retries a background media upload from the selected file if the initial pending upload lost its URL', () => {
        const source = readAppSource();

        expect(source).toContain('function retryBackgroundMediaUploadFromSelectedFile');
        expect(source).toContain('getBackgroundUploadFolderForJob(job)');
        expect(source).toContain('pendingUpload = uploadWithThumb(file, folder, userId, uploadOptions);');
        expect(source).toContain('pendingUpload = uploadVideoWithThumb(file, folder, userId, localThumbSeed, uploadOptions);');
        expect(source).toContain('result = await retryBackgroundMediaUploadFromSelectedFile({ userId, job });');
    });

    it('backs up selected media to the offline outbox while background uploads still need a Storage URL', () => {
        const source = readAppSource();

        expect(source).toContain('let backgroundOutboxBackupQueued = false;');
        expect(source).toContain('if (backgroundJobs.length > 0 && offlineOutboxMediaItems.length > 0) {');
        expect(source).toContain('const backupEntry = await queueOfflineOutboxEntry({');
        expect(source).toContain('mediaItems: offlineOutboxMediaItems');
        expect(source).toContain('backgroundOutboxBackupQueued = !!backupEntry;');
        expect(source).toContain('if (backgroundOutboxBackupQueued && Number(failed || 0) === 0) {');
        expect(source).toContain('removeOfflineOutboxEntry(user.uid, docId).catch(() => {});');
        expect(source).toContain('flushOfflineOutbox({ quiet: true }).catch(() => {});');
    });

    it('does not show a hard save failure after the primary daily log write already succeeded', () => {
        const source = readAppSource();

        expect(source).toContain('let primarySaveAcknowledged = false;');
        expect(source).toContain('primarySaveAcknowledged = true;');
        expect(source).toContain('if (primarySaveAcknowledged && latestSaveData && docId)');
        expect(source).toContain("showToast('\\u2705 \\uae30\\ub85d\\uc740 \\uc800\\uc7a5\\ub410\\uc5b4\\uc694.");
    });
});
