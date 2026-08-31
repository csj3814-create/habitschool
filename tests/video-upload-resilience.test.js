import { describe, expect, it } from 'vitest';
import { readAppSource, readRepoFile } from './source-helpers.js';

describe('video upload resilience', () => {
    it('converts local thumbnail data URLs without CSP-blocked fetch requests', () => {
        const source = readAppSource();

        expect(source).toContain('dataUrlToBlob,');
        expect(source).toContain('const blob = await dataUrlToBlob(normalizedThumb);');
        expect(source).toContain('const blob = dataUrlToBlob(normalized);');
        expect(source).toContain('const blob = dataUrlToBlob(dataUrl);');
        expect(source).not.toContain('fetch(normalized)');
        expect(source).not.toContain('fetch(dataUrl)');
    });

    it('keeps data URLs out of CSP connect-src', () => {
        const firebaseConfig = JSON.parse(readRepoFile('firebase.json'));
        const hostingConfigs = Array.isArray(firebaseConfig.hosting)
            ? firebaseConfig.hosting
            : [firebaseConfig.hosting];
        const cspHeader = hostingConfigs
            .flatMap((hosting) => hosting?.headers || [])
            .flatMap((entry) => entry.headers || [])
            .find((header) => header.key === 'Content-Security-Policy')?.value || '';
        const connectSourcePolicy = cspHeader.match(/(?:^|;)\s*connect-src\s+([^;]+)/)?.[1] || '';

        expect(connectSourcePolicy).not.toMatch(/(?:^|\s)data:(?:\s|$)/);
    });

    it('uses progress-aware resumable upload timeouts instead of a fixed 30 second cancel', () => {
        const source = readAppSource();

        // 무엇을 함께 들여오는지가 아니라, 이 둘을 공유 모듈에서 들여온다는 사실만 본다.
        expect(source).toContain('createSequentialTaskQueue');
        expect(source).toContain('getResumableUploadTimeouts');
        expect(source).toContain("} from './upload-performance.js");
        expect(source).toContain('runResumableUploadWithTimeout(storageRef, fileToUpload');
        expect(source).toContain('idleTimeoutMs: uploadTimeouts.idleTimeoutMs');
        expect(source).toContain('hardTimeoutMs: uploadTimeouts.hardTimeoutMs');
        expect(source).toContain('uploadTask.cancel()');
        expect(source).not.toContain('const timeoutMs = 30000');
        expect(source).not.toContain('업로드 시간 초과. 네트워크를 확인해주세요.');
    });

    it('keeps a URL-less pre-upload recoverable for ordered save retry', () => {
        const source = readAppSource();

        expect(source).toContain("if (!result?.url) {");
        expect(source).toContain('current.needsRetry = true;');
        expect(source).toContain('저장할 때 순서대로 다시 시도할게요');
        expect(source).not.toContain("setInlineUploadProgress(inputId, { state: 'error', pct: 100 })");
    });

    it('turns a stalled 0 percent pending upload into a delayed background-save state', () => {
        const source = readAppSource();

        expect(source).toContain('const INLINE_UPLOAD_STALLED_MS = 8000;');
        expect(source).toContain('function schedulePendingUploadStalledNotice');
        // 8초에 "지연"이라고 단정하지 않는다. 느린 회선에서는 그때가 정상 진행 중이다.
        expect(source).toContain('업로드 중이에요 · ${seconds}초째 · 저장하면 자동으로 이어갑니다');
        expect(source).not.toContain('업로드가 지연돼요');
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
        expect(source).toContain('const SAMSUNG_SIMPLE_UPLOAD_RETRY_ATTEMPTS = 1;');
        expect(source).toContain('const maxRetries = useSamsungSimpleUpload ? SAMSUNG_SIMPLE_UPLOAD_RETRY_ATTEMPTS : 2;');
        expect(source).toContain('if (useSamsungSimpleImageUpload) {');
        expect(source).toContain('await uploadSamsungImageWithSimplePut(storageRef, fileToUpload, onProgress);');
    });

    it('serializes every browser media upload and recovers URLs after client-side timeouts', () => {
        const source = readAppSource();

        expect(source).toContain('const SAMSUNG_SIMPLE_UPLOAD_RECOVERY_ATTEMPTS = 3;');
        expect(source).toContain('const _mediaStorageUploadQueue = createSequentialTaskQueue();');
        expect(source).toContain('function runMediaStorageUploadInSequence(callback');
        expect(source).toContain('업로드 대기 중 · 앞 파일부터 저장할게요');
        expect(source).toContain('function getDownloadUrlWithTimeout(storageRef, timeoutMs = 10000)');
        expect(source).toContain('async function recoverDownloadUrlAfterPossibleUploadTimeout');
        expect(source).toContain('const recoveredUrl = await recoverDownloadUrlAfterPossibleUploadTimeout(storageRef, {');
        expect(source).toContain('attempts: useSamsungSimpleUpload ? SAMSUNG_SIMPLE_UPLOAD_RECOVERY_ATTEMPTS : 1');
        expect(source).toContain('return runMediaStorageUploadInSequence(runUploadAttempts, { onProgress });');
        expect(source).toContain('function createUniqueMediaStoragePath');
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

    it('updates the exercise tab preview when a deferred video thumbnail resolves after upload', () => {
        const source = readAppSource();

        expect(source).toContain('function updateStrengthPreviewAfterResolvedThumb');
        expect(source).toContain("currentBlock.setAttribute('data-local-draft', 'true');");
        expect(source).toContain("currentBlock.removeAttribute('data-url');");
        expect(source).toContain('updateStrengthPreviewAfterResolvedThumb(inputId, {');
        expect(source).toContain('entry.localThumbDataUrl = thumbDataUrl;');
        expect(source).toContain('showStrengthPreviewImage(block, normalizedThumbUrl, { savedThumbUrl: normalizedThumbUrl });');
    });

    it('shows each selected exercise video frame immediately while thumbnail work is deferred', () => {
        const source = readAppSource();

        expect(source).toContain('function showLocalStrengthVideoPreview(target, file)');
        expect(source).toContain("previewVideo.setAttribute('data-local-preview-object-url', objectUrl);");
        expect(source).toContain('showStrengthPreviewVideo(target, objectUrl)');
        expect(source).toContain('function captureStrengthPreviewFrame(previewVideo)');
        expect(source).toContain('function resolveFirstUsableStrengthThumb(...thumbPromises)');
        expect(source).toContain("return canvas.toDataURL('image/jpeg', quality);");
        expect(source).toContain('function captureBestVideoFrameDataUrl(video, options = {})');
        expect(source).toContain('getVideoThumbnailCandidateTimes(video)');
        expect(source).toContain('requestVideoFrameCallback');
        expect(source).toContain('isRenderableVideoFramePixels(pixels)');
        expect(source).toContain('const previewFrameThumbPromise = showLocalStrengthVideoPreview(currentBlock || input.parentElement, file);');
        expect(source).toContain('uploadOptions.thumbDataUrlPromise = localThumbPromise;');
        expect(source).toContain("keepPendingThumb && previewVideo?.getAttribute('data-local-preview-object-url')");
        expect(source).toContain('revokeLocalPreviewObjectUrl(previewVideo);');
        expect(source).toContain("clearStrengthPreviewVideo(block.querySelector('.preview-strength-video'));");
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

    it('keeps validated selected media files available when mobile pickers clear input.files', () => {
        const source = readAppSource();

        expect(source).toContain('const _selectedMediaFileFallbacks = new WeakMap();');
        expect(source).toContain('function rememberSelectedMediaFile(input, file)');
        expect(source).toContain('_selectedMediaFileFallbacks.set(input, file);');
        expect(source).toContain('return input ? (_selectedMediaFileFallbacks.get(input) || null) : null;');
        expect(source).toContain('rememberSelectedMediaFile(input, file);');
        expect(source).toContain('const selectedFile = getSelectedMediaFile(inputEl);');
        expect(source).toContain('const selectedSleepFile = getSelectedMediaFile(sleepFile);');
        expect(source).toContain('const file = getSelectedMediaFile(input);');
        expect(source).toContain('clearSelectedMediaFile(input);');
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

        expect(source).toContain('const BACKGROUND_MEDIA_UPLOAD_RETRY_ATTEMPTS = 3;');
        expect(source).toContain('const BACKGROUND_MEDIA_UPLOAD_RETRY_BASE_DELAY_MS = 1500;');
        expect(source).toContain('function retryBackgroundMediaUploadFromSelectedFile');
        expect(source).toContain('function resolveBackgroundMediaUploadWithRetries');
        expect(source).toContain('for (let retryAttempt = 1; retryAttempt <= BACKGROUND_MEDIA_UPLOAD_RETRY_ATTEMPTS; retryAttempt++)');
        expect(source).toContain('await waitForBackgroundMediaUploadRetry(retryAttempt - 1);');
        expect(source).toContain('retrying: true');
        expect(source).toContain('업로드 재시도 중');
        expect(source).toContain('getBackgroundUploadFolderForJob(job)');
        expect(source).toContain('pendingUpload = uploadWithThumb(file, folder, userId, uploadOptions);');
        expect(source).toContain('pendingUpload = uploadVideoWithThumb(file, folder, userId, localThumbSeed, uploadOptions);');
        expect(source).toContain('const uploadResult = await resolveBackgroundMediaUploadWithRetries({ userId, job });');
        expect(source).toContain('result = uploadResult.result;');
    });

    it('runs background media uploads and document patches one item at a time', () => {
        const source = readAppSource();

        expect(source).toContain('const applyBackgroundMediaPatchSequentially = ({ job, result, updateGallery = true }) => {');
        expect(source).toContain('baseData: latestCommittedData');
        expect(source).toContain('patchChain = runPatch.catch(() => {});');
        expect(source).toContain('const processBackgroundMediaJob = async (job) => {');
        expect(source).toContain('const jobResults = [];');
        expect(source).toContain('for (const job of jobs) {');
        expect(source).toContain('jobResults.push(await processBackgroundMediaJob(job));');
        expect(source).not.toContain('Promise.all(jobs.map((job) => processBackgroundMediaJob(job)))');
        expect(source).toContain('failed = jobResults.filter((result) => result?.failed).length;');
    });

    it('fans out multi-selected exercise photos and videos into ordered single-file cards', () => {
        const source = readAppSource();

        expect(source).toContain('multiple onchange="handleExerciseMediaFiles(this, \'cardio\')"');
        expect(source).toContain('multiple onchange="handleExerciseMediaFiles(this, \'strength\')"');
        expect(source).toContain('window.handleExerciseMediaFiles = async function(input, type = \'cardio\')');
        expect(source).toContain('const selectedFiles = Array.from(input?.files || []);');
        expect(source).toContain('const block = index === 0 ? currentBlock : addExerciseBlock(normalizedType);');
        expect(source).toContain('await applyExerciseMediaFileToBlock(block, normalizedType, acceptedFiles[index])');
        expect(source).toContain('개를 순서대로 업로드할게요.');
    });

    it('uses the same FIFO queue for original and thumbnail Storage writes', () => {
        const source = readAppSource();

        expect(source).toContain('async function uploadBlobAndGetUrlInSequence');
        expect(source).toContain('return runMediaStorageUploadInSequence(async () => {');
        expect(source).toContain('const thumbUrl = await uploadBlobAndGetUrlInSequence(tr, thumbBlob);');
        expect(source).toContain('thumbUrl = await uploadBlobAndGetUrlInSequence(tr, thumbBlob);');
        expect(source).toContain('return await uploadBlobAndGetUrlInSequence(tr, blob, {');
    });

    it('treats backed-up background upload failures as deferred retry instead of terminal failure UI', () => {
        const source = readAppSource();

        expect(source).toContain('deferFailuresToOutbox = false');
        expect(source).toContain('deferredFailureInputIds = null');
        expect(source).toContain('deferFailuresToOutbox: backgroundOutboxBackupQueued');
        expect(source).toContain('deferredFailureInputIds: backgroundOutboxBackupInputIds');
        expect(source).toContain('function isBackgroundJobBackedByOutbox(job = {}, backedInputIds = null)');
        expect(source).toContain('job.failed && !job.deferred');
        expect(source).toContain("deferredCount > 0 ? '업로드 재시도 예약됨' : '업로드 완료'");
        expect(source).toContain("console.warn('[background-media] upload deferred to offline outbox:'");
        expect(source).toContain('return { failed: true, deferred: true };');
        expect(source).toContain('✅ 안전하게 저장했어요. 사진·영상은 백그라운드에서 계속 올라가요.');
    });

    it('suppresses automatic pre-upload failure toasts while deferred save paths retry media uploads', () => {
        const source = readAppSource();

        expect(source).toContain('const suppressFailureToast = options?.suppressFailureToast === true;');
        expect(source).toContain('if (!suppressFailureToast) {');
        expect(source).toContain('showToast(`⚠️ 업로드 실패: ${error.message}`);');
        expect(source).toContain('suppressFailureToast: true');
        expect(source).toContain('const pendingUpload = uploadVideoWithThumb(file, \'exercise_videos\', auth.currentUser.uid, localThumbSeed, uploadOptions);');
        expect(source).toContain('const pendingUpload = uploadWithThumb(file, folder, auth.currentUser.uid, {');
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

    it('restores exercise media into offline outbox save data even when the pending upload had no saved list item yet', () => {
        const source = readAppSource();

        expect(source).toContain('function upsertOfflineOutboxExerciseMedia(saveData = {}, mediaItem = null, uploadResult = {}, type = \'cardio\')');
        expect(source).toContain('saveData.exercise[listKey] = Array.isArray(saveData.exercise[listKey])');
        expect(source).toContain('target = { mediaId };');
        expect(source).toContain('saveData.exercise[listKey].push(target);');
        expect(source).toContain('target.imageUrl = uploadResult.url;');
        expect(source).toContain('target.videoUrl = uploadResult.url;');
        expect(source).toContain('return upsertOfflineOutboxExerciseMedia(saveData, mediaItem, uploadResult, \'cardio\');');
        expect(source).toContain('return upsertOfflineOutboxExerciseMedia(saveData, mediaItem, uploadResult, \'strength\');');
        expect(source).toContain('saveData.awardedPoints = awarded;');
    });

    it('restores pending exercise upload cards from the offline outbox before Storage URLs exist', () => {
        const source = readAppSource();

        expect(source).toContain('function upsertOfflineOutboxPendingExerciseMedia(data = {}, mediaItem = null)');
        expect(source).toContain('function mergeOfflineOutboxPendingMediaItems(data = {}, mediaItems = [])');
        expect(source).toContain('return mergeOfflineOutboxPendingMediaItems(mergedData, entry.mediaItems);');
        expect(source).toContain('uploadPending: true');
        expect(source).toContain('pendingUpload: true');
        expect(source).toContain('pendingItem.localThumbSeed = localThumbSeed;');
        expect(source).toContain("div.setAttribute('data-upload-pending', 'true');");
        expect(source).toContain('showStrengthPreviewImage(div, localThumbSeed, { localThumb: localThumbSeed });');
    });

    it('preserves exercise video thumbnails through replay and rehydrates missing persisted thumbnails after refresh', () => {
        const source = readAppSource();

        expect(source).toContain('pendingSnapshot?.localThumbDataUrl');
        expect(source).toContain('const thumbUrl = await pendingUpload.thumbPromise.catch(() => null);');
        expect(source).toContain('target.videoThumbUrl = uploadResult.thumbUrl || null;');
        expect(source).toContain('function hydrateStrengthPreviewFromPersistedVideo(block, url)');
        expect(source).toContain('extractVideoThumbFromUrl(url)');
        expect(source).toContain('cacheLocalExerciseVideoThumb(url, normalizedThumb);');
        expect(source).toContain('hydrateStrengthPreviewFromPersistedVideo(block, url);');
    });

    it('waits for strength video thumbnail URLs before the save or background patch writes exercise media', () => {
        const source = readAppSource();

        expect(source).toContain('getStrengthThumbSaveWaitMs');
        expect(source).toContain('function getStrengthThumbWaitMsForBlock(block = null, pendingSnapshot = null)');
        expect(source).toContain('function getMediaThumbWaitMsForJob(job = {}, pendingSnapshot = null)');
        expect(source).toContain('return resolvePendingUploadResult(job.inputId, { waitForThumbMs });');
        expect(source).toContain('waitForThumbMs: getMediaThumbWaitMsForJob(job, pendingSnapshot)');
        expect(source).toContain('const thumbResult = await resolvePendingUploadResult(fileInput?.id, {');
        expect(source).toContain('waitForThumbMs: getStrengthThumbWaitMsForBlock(block, pendingSnapshot)');
    });

    it('유산소 사진도 썸네일을 기다린 뒤에 쓴다', () => {
        const source = readAppSource();

        // 근력만 기다리고 유산소는 0을 돌려주고 있었다. 그래서 썸네일이 늦으면
        // imageThumbUrl: null 이 그대로 굳었고, 완성된 썸네일은 Storage에만 남았다.
        // 저장된 것의 24.2%(유산소) 대 10.8%(근력)가 이 차이였다.
        expect(source).toContain("if (job?.kind === 'cardio') return getCardioThumbSaveWaitMs();");
        expect(source).toContain('getCardioThumbSaveWaitMs,');

        // 대기 시간을 받아도 다시 근력만 통과시키는 문이 있으면 소용이 없다.
        expect(source).not.toContain("if (job.kind === 'strength' && nextResult?.url && !nextResult.thumbUrl");
        expect(source).toContain('&& getMediaThumbWaitMsForJob(job, nextPendingSnapshot) > 0) {');
    });

    it('does not show a hard save failure after the primary daily log write already succeeded', () => {
        const source = readAppSource();

        expect(source).toContain('let primarySaveAcknowledged = false;');
        expect(source).toContain('primarySaveAcknowledged = true;');
        expect(source).toContain('if (primarySaveAcknowledged && latestSaveData && docId)');
        expect(source).toContain("showToast('\\u2705 \\uae30\\ub85d\\uc740 \\uc800\\uc7a5\\ub410\\uc5b4\\uc694.");
    });

    it('does not report an upload failure when the media URL is already durable in the daily log', () => {
        const source = readAppSource();

        expect(source).toContain('function runBackgroundMediaFollowup(label, callback)');
        expect(source).toContain('function findPersistedBackgroundMediaUrl(logData = {}, job = {})');
        expect(source).toContain('async function verifyBackgroundMediaPersisted');
        expect(source).toContain('getDocFromServer(docRef)');
        // 확인 결과를 persisted / absent / unknown 으로 나눴다. 예전에는 셋을 다 null 로
        // 뭉뚱그려서, '확인 못 함'이 '저장 실패'로 보고됐다.
        expect(source).toContain('const verification = await verifyBackgroundMediaPersisted');
        expect(source).toContain("if (verification.status === 'persisted')");
        expect(source).toContain("console.info('[background-media] recovered completed save after follow-up error:'");
        expect(source).toContain('finished: true');
        expect(source).toContain('failed: false');
    });

    it('verifies uploaded Storage objects are non-empty before returning a download URL', () => {
        const source = readAppSource();

        expect(source).toContain('getDownloadURL, getMetadata');
        expect(source).toContain('async function verifyNonEmptyStorageObject(storageRef, timeoutMs = 10000)');
        expect(source).toContain('getMetadata(storageRef)');
        expect(source).toContain("error.code = 'upload/empty-object';");
        expect(source).toContain('async function getVerifiedDownloadUrlWithTimeout(storageRef, timeoutMs = 10000)');
        expect(source).toContain('const url = await getVerifiedDownloadUrlWithTimeout(storageRef, uploadTimeouts.finalizeTimeoutMs);');
        expect(source).toContain('const url = await getVerifiedDownloadUrlWithTimeout(storageRef, timeoutMs);');
    });
});

describe('삼성 인터넷 영상 업로드 피드백', () => {
    const app = readRepoFile('js/app-core.js');
    const sliceFn = (source, header) => {
        const start = source.indexOf(header);
        if (start < 0) return '';
        const bodyStart = source.indexOf(') {', start);
        if (bodyStart < 0) return '';
        let depth = 0;
        for (let i = bodyStart + 2; i < source.length; i += 1) {
            if (source[i] === '{') depth += 1;
            else if (source[i] === '}') { depth -= 1; if (depth === 0) return source.slice(start, i + 1); }
        }
        return '';
    };

    // 제보: 영상 여러 개를 올리면 뒤의 파일이 '업로드 대기 중' 에서 멈춘 것처럼 보인다.
    // 앞의 전송이 진행 이벤트를 안 주는 단순 PUT 이라 화면이 통째로 정지한다.
    it('대기 문구가 남은 순번을 받는다', () => {
        const fn = sliceFn(app, 'function runMediaStorageUploadInSequence(callback');
        expect(fn).toContain('onQueued: (ahead)');
        expect(fn).toContain('앞에 ${Number(ahead)}개 남았어요');
        // 순번이 1이면 기존 문구를 유지한다
        expect(fn).toContain('업로드 대기 중 · 앞 파일부터 저장할게요');
    });

    // uploadBytes 는 바이트 진행을 전혀 주지 않는다. 0% 막대가 몇 분 동안
    // 그대로면 실패와 구분이 안 된다.
    it('진행 이벤트가 없는 전송에 경과 시간을 흘린다', () => {
        const fn = sliceFn(app, 'async function uploadSamsungVideoWithSimplePut(storageRef, file');
        expect(fn).toContain('setInterval');
        expect(fn).toContain('초째');
        expect(fn).toContain('indeterminate: true');
        // 타이머는 반드시 정리한다
        expect(fn).toContain('finally');
        expect(fn).toContain('clearInterval(heartbeat)');
    });

    it('가짜 퍼센트를 그리지 않는다', () => {
        const fn = sliceFn(app, 'async function uploadSamsungVideoWithSimplePut(storageRef, file');
        // 하트비트는 pct 0 을 유지하고 막대만 애니메이션으로 움직인다
        expect(fn).not.toMatch(/pct:\s*[1-9]/);
    });

    it('막대가 0%로 굳지 않도록 indeterminate 를 UI 까지 전달한다', () => {
        expect(sliceFn(app, 'function normalizeUploadProgressPayload(payload')).toContain('indeterminate');
        expect(sliceFn(app, 'function updatePendingUploadProgress(inputId')).toContain('indeterminate');
        expect(app).toContain("classList.toggle('is-indeterminate'");
        expect(readRepoFile('styles-features.css')).toContain('.upload-progress-status__fill.is-indeterminate');
    });
});
