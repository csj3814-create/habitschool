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
        expect(source).toContain('const maxRetries = useSamsungSimpleImageUpload ? 0 : 2;');
        expect(source).toContain('if (useSamsungSimpleImageUpload) {');
        expect(source).toContain('await uploadSamsungImageWithSimplePut(storageRef, fileToUpload, onProgress);');
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
