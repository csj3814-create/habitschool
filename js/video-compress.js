/**
 * 업로드 전 동영상 재인코딩.
 *
 * 사진은 compressImage 를 지나는데 동영상은 촬영된 그대로 올라갔다. 폰 카메라의
 * 1080p 기본 비트레이트는 5~6Mbps 라, 10초 하이퍼랩스가 7MB 가 된다. 혼잡한 LTE
 * 상행에서 그건 그냥 많은 바이트고, "업로드가 너무 느려 못 쓰겠다"는 말이 나왔다.
 *
 * 방식: 원본을 video 로 재생하면서 그 스트림을 MediaRecorder 로 낮은 비트레이트에
 * 다시 담는다. 외부 의존성이 없고(CSP상 CDN을 쓸 수 없다) 디먹서도 필요 없다.
 * 대신 재생 속도로 진행한다 — 10초 영상이면 10초. 7MB 를 느린 회선으로 올리는
 * 것보다는 짧다.
 *
 * 캔버스에 축소해 그리는 방법을 먼저 썼는데 버렸다. 그건 화면이 실제로 그려질
 * 때만(requestAnimationFrame) 프레임이 흐른다. 전사 도중 앱을 벗어나면 길이가
 * 0초인 파일이 나오는데, 그건 작기까지 해서 "많이 줄었다"는 검사를 통과한다.
 * 같은 조건에서 video 스트림을 직접 담으면 길이가 그대로 보존된다(실측 확인).
 * 해상도는 원본을 유지하지만, 줄어드는 양은 대부분 비트레이트에서 온다.
 *
 * 안 되는 기기가 있다(iOS Safari 는 HTMLVideoElement.captureStream 이 없다).
 * 그런 곳에서는 조용히 원본을 그대로 올린다. 압축은 최적화지 전제가 아니다.
 */

const MB = 1024 * 1024;

// 이보다 작으면 그냥 올린다. 디코딩도 하지 않는 값싼 1차 관문이다.
//
// 15MB 였다. 크기 하나로 정하면 틀린다는 게 드러나 낮추고, 대신 길이를 함께 보는
// 2차 관문(isCompressionWorthwhile)을 뒤에 뒀다. 길이는 파일을 열어야 알 수 있어서
// 여기서는 볼 수 없다.
//
// 운영 영상 500개 표본(2026-09-02): 중앙값 17.14MB · 6초 · 23.1Mbps.
// 구간별 개수 — 0-2MB 8 · 2-4MB 39 · 4-8MB 47 · 8-15MB 116 · 15MB+ 290.
// 8MB 로 두면 4-8MB 구간 47개(9.4%)가 걸러지는데, 6MB·6초짜리는 (6-4)*8=16초를
// 벌고 6초를 쓰니 압축이 이득이다. 5MB 로 내려 2차 관문이 판단하게 넘긴다 —
// 여기서 통과시켜도 길이를 보고 되돌릴 수 있고, 여기서 막으면 기회가 없다.
export const VIDEO_COMPRESS_MIN_BYTES = 5 * MB;

// 압축이 이득인지는 크기가 아니라 **비트레이트**가 정한다.
//
// 재인코딩은 재생 속도로 걸린다 — 60초 영상이면 60초. 그동안 한 바이트도 올라가지
// 않는다. 그러니 "줄여서 버는 업로드 시간 > 줄이는 데 드는 시간" 일 때만 값을 한다.
//
// 버는 양은 (원본 - 목표 4MB) 이고, 그걸 느린 업링크(약 1Mbps)로 환산하면 대략
// (MB 차이 × 8)초다. 그 값이 재생 시간보다 커야 한다.
//
//   10MB · 20초 → 48초 절약 vs 20초 대기 → 줄인다
//   10MB · 60초 → 48초 절약 vs 60초 대기 → 그냥 올린다
//
// 같은 10MB 라도 짧고 뚱뚱하면 줄이고, 길고 가벼우면 그대로 둔다.
export function isCompressionWorthwhile(sizeBytes, durationMs) {
    const sizeMB = Math.max(0, Number(sizeBytes) || 0) / MB;
    const durationSec = Math.max(0, Number(durationMs) || 0) / 1000;
    // 길이를 못 읽은 파일은 크기만 보고 판단한다 — 1차 관문을 통과했으니 줄인다.
    if (durationSec <= 0) return true;
    const savedMB = sizeMB - (TARGET_UPLOAD_BYTES / MB);
    if (savedMB <= 0) return false;
    return savedMB * 8 > durationSec;
}

// 비트레이트는 "올린 뒤의 용량"에서 거꾸로 정한다.
//
// 해상도만 보고 정했더니 40초 4K 영상이 12MB 로 나왔고, 느린 회선에서 그건 다시
// 2분짜리 업로드다. 압축의 목적이 업로드 시간을 줄이는 것이므로, 길이가 얼마든
// 결과 용량이 일정 범위 안에 들어오게 잡는 편이 목적에 맞다.
//
// 다만 한없이 낮추면 못 볼 영상이 되므로 위아래로 묶는다. 해상도가 높을수록
// 같은 비트레이트에서 더 뭉개지니 하한을 조금 올려 준다.
export const TARGET_UPLOAD_BYTES = 4 * 1024 * 1024;

export function getTargetBitrate(width = 0, height = 0, durationMs = 0) {
    const pixels = Math.max(0, Number(width) || 0) * Math.max(0, Number(height) || 0);
    const ceiling = pixels > 1920 * 1080 ? 2500000
        : pixels > 1280 * 720 ? 1600000
        : 1200000;
    const floor = pixels > 1920 * 1080 ? 900000
        : pixels > 1280 * 720 ? 700000
        : 500000;

    const seconds = Math.max(0, Number(durationMs) || 0) / 1000;
    if (!seconds) return ceiling;   // 길이를 모르면 화질 쪽에 선다.

    const fitted = (TARGET_UPLOAD_BYTES * 8) / seconds;
    return Math.round(Math.min(ceiling, Math.max(floor, fitted)));
}

// 재인코딩은 재생 속도로 걸린다. 길이가 곧 기다리는 시간이라, 여기서 끊지 않으면
// 10분짜리를 고른 사람은 10분을 기다리게 된다.
export const MAX_VIDEO_DURATION_MS = 3 * 60 * 1000;

// 재인코딩 결과가 이만큼도 못 줄이면 굳이 바꿀 이유가 없다. 화질만 잃는다.
const MIN_USEFUL_RATIO = 0.85;

// 결과물 길이가 원본의 이 비율에 못 미치면 잘린 것으로 본다.
const MIN_DURATION_RATIO = 0.8;

// 재생이 끝나도 onended 가 오지 않는 파일이 있다. 길이 + 여유만큼만 기다린다.
const HARD_TIMEOUT_PAD_MS = 15000;
const PROBE_TIMEOUT_MS = 5000;
const METADATA_TIMEOUT_MS = 10000;

export function canCompressVideoInBrowser() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;
    if (typeof window.MediaRecorder !== 'function') return false;
    if (typeof HTMLVideoElement === 'undefined') return false;
    // iOS Safari 에는 이게 없다. 이 방식 전체가 여기에 달려 있다.
    if (typeof HTMLVideoElement.prototype.captureStream !== 'function') return false;
    return true;
}

// mp4 로 못 담으면 압축하지 않는다.
//
// webm 은 iOS Safari 가 재생하지 못한다. 그런데 압축을 못 하는 기기(captureStream
// 이 없는 iOS)와 webm 을 못 보는 기기가 정확히 같은 집합이라, webm 으로 저장하면
// 안드로이드에서 올린 영상을 아이폰 친구가 못 여는 상황이 새로 생긴다.
// 업로드를 줄이려다 재생을 깨는 건 이 작업의 목적이 아니다.
export function pickRecorderMimeType() {
    const candidates = ['video/mp4;codecs=avc1', 'video/mp4'];
    for (const type of candidates) {
        try {
            if (window.MediaRecorder.isTypeSupported(type)) return type;
        } catch (_) {}
    }
    return '';
}

export function shouldCompressVideoFile(file, { minBytes = VIDEO_COMPRESS_MIN_BYTES } = {}) {
    if (!file || typeof file !== 'object') return false;
    if (!String(file.type || '').toLowerCase().startsWith('video/')) return false;
    return Number(file.size || 0) > minBytes;
}

function loadVideoElement(file) {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;';
        document.body.appendChild(video);

        const cleanup = () => {
            try { video.pause(); } catch (_) {}
            video.removeAttribute('src');
            try { video.load(); } catch (_) {}
            video.remove();
            URL.revokeObjectURL(objectUrl);
        };

        let settled = false;
        const fail = (reason) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error(reason));
        };
        video.onerror = () => fail('video_decode_failed');
        video.onloadedmetadata = () => {
            if (settled) return;
            if (!video.videoWidth || !video.videoHeight) return fail('video_no_dimensions');
            settled = true;
            resolve({ video, cleanup });
        };
        setTimeout(() => fail('video_metadata_timeout'), METADATA_TIMEOUT_MS);
        video.src = objectUrl;
        try { video.load(); } catch (_) { fail('video_load_threw'); }
    });
}

// 고르는 시점에 길이를 알아야 "너무 긴 영상"이라고 바로 말해 줄 수 있다.
// 압축 안에서 걸러 버리면 나중에 용량 오류로 나와, 왜 거절됐는지 알 수 없다.
export async function probeVideoFile(file) {
    if (!file || typeof document === 'undefined') return null;
    try {
        const { video, cleanup } = await loadVideoElement(file);
        const info = {
            durationMs: Number.isFinite(video.duration) ? video.duration * 1000 : 0,
            width: video.videoWidth,
            height: video.videoHeight
        };
        cleanup();
        return info;
    } catch (_) {
        return null;
    }
}

// 재인코딩 결과가 실제로 재생 가능한 영상인지 확인한다.
//
// 크기만 보면 잘린 파일이 "가장 많이 줄어든" 결과로 통과한다. 그대로 두면
// 사용자의 운동 영상을 빈 파일로 바꿔 올리게 된다. 원본보다 나쁜 결과를 조용히
// 내보내느니 압축을 포기하는 편이 낫다.
function probeEncodedVideo(blob) {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(blob);
        const probe = document.createElement('video');
        probe.muted = true;
        probe.preload = 'metadata';
        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            probe.removeAttribute('src');
            try { probe.load(); } catch (_) {}
            URL.revokeObjectURL(url);
            resolve(value);
        };
        probe.onloadedmetadata = () => finish({
            durationMs: Number.isFinite(probe.duration) ? probe.duration * 1000 : 0,
            width: probe.videoWidth,
            height: probe.videoHeight
        });
        probe.onerror = () => finish(null);
        setTimeout(() => finish(null), PROBE_TIMEOUT_MS);
        probe.src = url;
    });
}

/**
 * 성공하면 더 작은 새 File 을, 아니면 null 을 돌려준다.
 * null 은 실패가 아니라 "원본을 그대로 쓰라"는 뜻이다 — 부르는 쪽이 그렇게 다룬다.
 */
export async function compressExerciseVideo(file, {
    onProgress = null,
    minBytes = VIDEO_COMPRESS_MIN_BYTES
} = {}) {
    if (!canCompressVideoInBrowser()) return null;
    if (!shouldCompressVideoFile(file, { minBytes })) return null;

    const mimeType = pickRecorderMimeType();
    if (!mimeType) return null;

    let handle = null;
    try {
        handle = await loadVideoElement(file);
    } catch (error) {
        console.warn('[video] 압축용 디코드 실패, 원본을 그대로 올립니다:', error.message);
        return null;
    }

    const { video, cleanup } = handle;
    const durationMs = Number.isFinite(video.duration) && video.duration > 0
        ? video.duration * 1000
        : 0;

    // 2차 관문. 길이는 여기까지 와야 알 수 있다. 길고 가벼운 영상은 줄이는 시간이
    // 버는 시간보다 길어서, 그대로 올리는 편이 사용자에게 빠르다.
    if (!isCompressionWorthwhile(file.size, durationMs)) {
        console.log('[video] 길이 대비 이득이 없어 원본을 그대로 올립니다: '
            + (file.size / MB).toFixed(1) + 'MB / ' + (durationMs / 1000).toFixed(0) + '초');
        cleanup();
        return null;
    }

    try {
        const stream = video.captureStream();
        if (!stream || !stream.getVideoTracks().length) return null;

        const chunks = [];
        const recorder = new window.MediaRecorder(stream, {
            mimeType,
            videoBitsPerSecond: getTargetBitrate(video.videoWidth, video.videoHeight, durationMs)
        });
        recorder.ondataavailable = (event) => {
            if (event.data && event.data.size) chunks.push(event.data);
        };

        const finished = new Promise((resolve) => {
            let settled = false;
            const done = () => { if (!settled) { settled = true; resolve(); } };
            recorder.onstop = done;
            recorder.onerror = done;
            // onended 가 안 오는 파일이 있다. 길이를 알면 그만큼만 기다린다.
            if (durationMs) {
                setTimeout(() => { try { recorder.stop(); } catch (_) {} },
                    durationMs + HARD_TIMEOUT_PAD_MS);
            }
        });

        // 진행률은 timeupdate 로 본다. requestAnimationFrame 과 달리 화면이 안
        // 그려져도 재생 중에는 계속 온다.
        if (durationMs && typeof onProgress === 'function') {
            video.ontimeupdate = () => {
                const pct = Math.min(99, Math.round((video.currentTime * 1000 / durationMs) * 100));
                try { onProgress(pct); } catch (_) {}
            };
        }

        video.onended = () => { try { recorder.stop(); } catch (_) {} };
        recorder.start();
        video.currentTime = 0;
        await video.play();
        await finished;
        video.ontimeupdate = null;
        stream.getTracks().forEach((track) => { try { track.stop(); } catch (_) {} });

        const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
        if (!blob.size) return null;

        // 줄지 않았으면 바꿀 이유가 없다.
        if (blob.size >= Number(file.size || 0) * MIN_USEFUL_RATIO) {
            console.info('[video] 재인코딩이 의미 있게 줄이지 못해 원본을 유지합니다.');
            return null;
        }

        // 잘린 결과는 가장 작아서 위 검사를 가장 잘 통과한다. 길이로 다시 본다.
        if (durationMs) {
            const probed = await probeEncodedVideo(blob);
            if (!probed || !probed.width || probed.durationMs < durationMs * MIN_DURATION_RATIO) {
                console.warn('[video] 재인코딩 결과가 온전하지 않아 원본을 유지합니다.'
                    + ' 원본 ' + Math.round(durationMs) + 'ms,'
                    + ' 결과 ' + Math.round(probed?.durationMs || 0) + 'ms');
                return null;
            }
        }

        const baseName = String(file.name || 'exercise').replace(/\.[^.]+$/, '');
        const compressed = new File([blob], baseName + '_compressed.mp4', {
            type: blob.type,
            lastModified: Date.now()
        });
        console.info('[video] 재인코딩 완료: '
            + (file.size / MB).toFixed(2) + 'MB → ' + (compressed.size / MB).toFixed(2) + 'MB');
        if (typeof onProgress === 'function') { try { onProgress(100); } catch (_) {} }
        return compressed;
    } catch (error) {
        console.warn('[video] 재인코딩 실패, 원본을 그대로 올립니다:', error?.message || error);
        return null;
    } finally {
        cleanup();
    }
}
