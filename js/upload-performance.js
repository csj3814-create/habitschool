const KB = 1024;
const MB = 1024 * KB;

const FAST_PATH_IMAGE_LIMITS = Object.freeze({
    'image/jpeg': Math.round(1.8 * MB),
    'image/jpg': Math.round(1.8 * MB),
    'image/webp': Math.round(1.8 * MB),
    'image/png': Math.round(0.9 * MB)
});

const RESUMABLE_UPLOAD_TIMEOUTS = Object.freeze({
    image: Object.freeze({
        hardTimeoutMs: 60 * 1000,
        idleTimeoutMs: 30 * 1000,
        finalizeTimeoutMs: 10 * 1000
    }),
    video: Object.freeze({
        minHardTimeoutMs: 5 * 60 * 1000,
        maxHardTimeoutMs: 20 * 60 * 1000,
        hardTimeoutPerMbMs: 12 * 1000,
        minIdleTimeoutMs: 90 * 1000,
        maxIdleTimeoutMs: 3 * 60 * 1000,
        idleTimeoutPerMbMs: 4 * 1000,
        finalizeTimeoutMs: 30 * 1000
    })
});

function clampNumber(value, min, max) {
    const normalized = Number(value);
    if (!Number.isFinite(normalized)) return min;
    return Math.max(min, Math.min(max, normalized));
}

function callQueueHook(callback, ...args) {
    if (typeof callback !== 'function') return;
    try {
        callback(...args);
    } catch (_) {}
}

export function createSequentialTaskQueue() {
    let tail = Promise.resolve();
    let pendingCount = 0;
    // 아직 시작하지 못한 작업들. 앞이 하나 끝나면 이 목록의 순번이 전부 바뀐다.
    const waiting = [];

    // 큐가 한 칸 줄면 뒤에 선 항목들에게 새 순번을 알린다. 이걸 안 하면 세 번째
    // 파일은 자기 차례가 올 때까지 처음 받은 문구를 그대로 달고 서 있게 되고,
    // 진행 이벤트가 없는 업로드(삼성 인터넷의 단순 PUT)가 앞에 있으면 화면이
    // 몇 분 동안 한 글자도 바뀌지 않아 멈춘 것처럼 보인다.
    const notifyWaiting = () => {
        for (let i = 0; i < waiting.length; i += 1) {
            const ahead = i + 1;
            // 순번이 그대로인 항목까지 다시 알리면 같은 문구를 계속 덮어써서
            // 화면만 흔들린다. 바뀐 것만 보낸다.
            if (waiting[i].lastAhead === ahead) continue;
            waiting[i].lastAhead = ahead;
            callQueueHook(waiting[i].onQueued, ahead);
        }
    };

    return Object.freeze({
        enqueue(task, { onQueued = null, onStart = null, onSettled = null } = {}) {
            if (typeof task !== 'function') return Promise.resolve(null);

            pendingCount += 1;
            const waiter = { onQueued, lastAhead: 0 };
            if (pendingCount > 1) {
                waiting.push(waiter);
                waiter.lastAhead = waiting.length;
                callQueueHook(onQueued, waiter.lastAhead);
            }

            const run = tail
                .catch(() => {})
                .then(async () => {
                    const at = waiting.indexOf(waiter);
                    if (at >= 0) waiting.splice(at, 1);
                    notifyWaiting();
                    callQueueHook(onStart);
                    return await task();
                });
            const tracked = run.finally(() => {
                pendingCount = Math.max(0, pendingCount - 1);
                callQueueHook(onSettled, pendingCount);
            });

            // A failed task must not block the next queued media item.
            tail = tracked.catch(() => {});
            return tracked;
        },
        get pendingCount() {
            return pendingCount;
        }
    });
}

export function shouldFastPathImageCompression(file = null, options = {}) {
    if (!file || typeof file !== 'object') return false;

    const type = String(file.type || '').trim().toLowerCase();
    const size = Number(file.size || 0);
    const maxWidth = Number(options.maxWidth || 0);
    const maxHeight = Number(options.maxHeight || 0);
    const quality = Number(options.quality || 0);
    const fastPath = options.fastPath !== false;

    if (!fastPath || !type.startsWith('image/') || size <= 0) return false;

    // Health/AI analysis paths may request a larger target size on purpose.
    if (maxWidth > 1000 || maxHeight > 1000 || quality > 0.85) return false;

    // Keep HEIC/HEIF on the conversion path for browser compatibility.
    if (type === 'image/heic' || type === 'image/heif' || type === 'image/avif') return false;

    const sizeLimit = FAST_PATH_IMAGE_LIMITS[type];
    return Number.isFinite(sizeLimit) && size <= sizeLimit;
}

export function getDeferredVideoThumbDelayMs(fileSize = 0) {
    const normalizedSize = Math.max(0, Number(fileSize || 0));
    if (normalizedSize === 0) return 0;
    if (normalizedSize <= 6 * MB) return 650;
    if (normalizedSize <= 20 * MB) return 350;
    return 0;
}

/**
 * 사전 업로드 표시에서 "몇 초째" 안내를 언제 끄고 언제 다시 켤지 정한다.
 *
 * 퍼센트가 오르는 중이면 셀 필요가 없다. 할 말이 있는 동안(압축 진행률, 대기 순번)에도
 * 셀 필요가 없다. 문제는 그 말이 **끊겼을 때**다. 운동영상은 전송 전에 폰에서 재인코딩을
 * 하는데, 그동안은 "영상을 줄이는 중… N%" 가 계속 오다가 압축이 끝나는 순간 뚝 끊기고
 * 퍼센트 0 만 남는다. 그 자리에서 다시 켜지 않으면 화면은 '업로드 준비 중 0%' 인 채로
 * 몇 분을 서 있고, 그건 실패한 화면과 구분되지 않는다.
 *
 * @param {{progress?: number, message?: string, ticking?: boolean}} state
 * @returns {{ticker: 'cancel'|'arm', render: boolean}}
 *   ticker 'arm' 은 "돌고 있지 않으면 걸어라"는 뜻이다(이미 돌고 있으면 그대로 둔다).
 *   render false 는 이미 초를 세고 있으니 그 문구를 0% 로 덮지 말라는 뜻이다.
 */
export function resolveUploadNoticeAction({ progress = 0, message = '', ticking = false } = {}) {
    const pct = Math.max(0, Number(progress) || 0);
    const hasMessage = String(message || '').trim().length > 0;
    if (pct > 0 || hasMessage) return { ticker: 'cancel', render: true };
    return { ticker: 'arm', render: ticking !== true };
}

export function getResumableUploadTimeouts(file = null) {
    const type = String(file?.type || '').trim().toLowerCase();
    const size = Math.max(0, Number(file?.size || 0));

    if (!type.startsWith('video/')) {
        return { ...RESUMABLE_UPLOAD_TIMEOUTS.image };
    }

    const sizeMb = Math.max(1, Math.ceil(size / MB));
    const video = RESUMABLE_UPLOAD_TIMEOUTS.video;

    return {
        hardTimeoutMs: Math.round(clampNumber(
            sizeMb * video.hardTimeoutPerMbMs,
            video.minHardTimeoutMs,
            video.maxHardTimeoutMs
        )),
        idleTimeoutMs: Math.round(clampNumber(
            sizeMb * video.idleTimeoutPerMbMs,
            video.minIdleTimeoutMs,
            video.maxIdleTimeoutMs
        )),
        finalizeTimeoutMs: video.finalizeTimeoutMs
    };
}
