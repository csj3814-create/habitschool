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

    it('bounds the background Firestore patch after media upload reaches the final sync phase', () => {
        const source = readAppSource();

        expect(source).toContain('const BACKGROUND_MEDIA_PATCH_TIMEOUT_MS = 8000;');
        expect(source).toContain('background_media_patch_timeout');
        expect(source).toContain('function queueBackgroundMediaPatchRetry');
        expect(source).toContain('habitschool-background-media-patches-v1');
        expect(source).toContain("noteFirestoreConnectivityFailure(error, 'background media patch')");
        expect(source).toContain('flushBackgroundMediaPatchQueue({ quiet: true })');
    });

    it('does not show a hard save failure after the primary daily log write already succeeded', () => {
        const source = readAppSource();

        expect(source).toContain('let primarySaveAcknowledged = false;');
        expect(source).toContain('primarySaveAcknowledged = true;');
        expect(source).toContain('if (primarySaveAcknowledged && latestSaveData && docId)');
        expect(source).toContain("showToast('\\u2705 \\uae30\\ub85d\\uc740 \\uc800\\uc7a5\\ub410\\uc5b4\\uc694.");
    });
});
