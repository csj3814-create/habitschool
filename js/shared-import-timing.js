/**
 * 공유한 사진이 등록되기까지 단계별로 걸린 시간을 모은다.
 *
 * 값은 페이지가 열린 때(performance.timeOrigin)부터 그 단계까지의 밀리초다. 앞 단계와의
 * 차이가 그 단계의 대기 시간이다. functions/shared-upload.js 의 reportSharedImportTiming 이
 * 서버 로그에 한 줄로 남기고, 같은 값이 콘솔에도 남아 오류 제보에 실린다.
 * uid·사진·건강 수치는 담지 않는다.
 */

export const SHARED_IMPORT_TIMING_STEPS = Object.freeze([
    'app_code_ready',
    'auth_ready',
    'claim_done',
    'daily_log_ready',
    'sheet_open',
    'classify_done',
    'target_set',
    'upload_done',
    'analysis_done',
    'save_click',
    'save_ready',
    'save_done'
]);

function randomTrace() {
    const bytes = new Uint8Array(4);
    globalThis.crypto.getRandomValues(bytes);
    return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

/** 한 번의 공유를 따라가는 기록. 같은 단계는 처음 시각만 남긴다. */
export function createSharedImportTimeline({ now = () => performance.now(), trace = randomTrace() } = {}) {
    const steps = {};
    const info = {};
    let unsentMarks = 0;
    return {
        trace,
        mark(step, atMs = now()) {
            if (!SHARED_IMPORT_TIMING_STEPS.includes(step) || steps[step] !== undefined) return false;
            steps[step] = Math.round(atMs);
            unsentMarks += 1;
            return true;
        },
        setInfo(values = {}) {
            Object.assign(info, values);
        },
        has(step) {
            return steps[step] !== undefined;
        },
        /** 지난번 뒤로 새로 찍힌 단계가 없으면 null — 같은 줄을 두 번 남기지 않는다. */
        takeReport(outcome) {
            if (unsentMarks === 0) return null;
            unsentMarks = 0;
            return { trace, outcome, ...info, steps: { ...steps } };
        }
    };
}
