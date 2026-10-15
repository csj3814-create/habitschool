import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 2026-10-15 제보: "명상 호흡에서 중단 누르니까 호흡 중지가 되는게 아니라 화면만 멈추고
// 뒤에선 시간이 돌아가네? 의도는 중단 누르면 호흡을 중단하고 초기화 하는 것."
//
// 원인: 명상 중에 그날 기록을 다시 불러오면(저장, Health Connect 자동 저장 뒤 정산
// 반영 등) applyMeditationLogToUi 가 '중단하면 돌아갈 상태' 를 진행 중 타이머로
// 덮었다. 중단은 틱을 멈춘 뒤 그 '진행 중' 상태로 돌아갔고, 끝나는 시각(endAtMs)이
// 남아 화면만 멈춘 채 남은 시간은 계속 줄었다.
const app = readRepoFile('js/app-core.js');

const slice = (header, endMarker) => {
    const start = app.indexOf(header);
    expect(start).toBeGreaterThan(-1);
    const end = app.indexOf(endMarker, start + header.length);
    expect(end).toBeGreaterThan(start);
    return app.slice(start, end);
};

function loadMachine({ timerState }) {
    const apply = slice('function applyMeditationLogToUi(', '\nfunction _getRecordGuideStates(');
    const cancel = slice('window.cancelMeditationSession = function', '\nwindow.toggleMeditationSound = function');
    const calls = { tick: 0, toast: [] };
    const DATE = '2026-10-15';
    const window = {};
    const env = {
        window,
        getSelectedRecordDateStr: () => DATE,
        stopMeditationTimerTick: () => {},
        startMeditationTimerTick: () => { calls.tick += 1; },
        cancelMeditationVoiceCue: () => {},
        clearMeditationJson: () => {},
        closeMindfulnessFullscreenExperience: () => {},
        // 실제 공장처럼 남은 시간이 없으면 전체 시간으로 채운다
        createMeditationUiState: (o = {}) => ({ ...o, remainingSec: o.remainingSec ?? o.durationSec }),
        isActiveMeditationStatus: (status) => status === 'running' || status === 'paused',
        normalizeMeditationLog: () => ({ meditationMethodId: 'abdominal_breathing', meditationDurationSec: 300, meditationDone: false, meditationCompletedAt: '' }),
        readMeditationDraftState: () => null,
        readMeditationTimerState: () => timerState,
        writeMeditationDraftState: () => {},
        clearMeditationDraftState: () => {},
        getMeditationCountdownSeconds: (s) => (s.endAtMs ? Math.ceil((s.endAtMs - Date.now()) / 1000) : s.remainingSec),
        getMeditationMethodMeta: () => ({ id: 'abdominal_breathing', durationSec: 300 }),
        setMeditationCueTokenFromState: () => {},
        renderMeditationUi: () => {},
        showToast: (m) => calls.toast.push(m),
        isEnglishLocale: () => false,
        MEDITATION_TIMER_STORAGE_KEY: 'k'
    };
    const names = Object.keys(env);
    // eslint-disable-next-line no-new-func
    const run = new Function(...names, `
        let _meditationUiState = null;
        let _meditationRestorableState = null;
        ${apply}
        ${cancel}
        return {
            apply: applyMeditationLogToUi,
            cancel: () => window.cancelMeditationSession(),
            state: () => _meditationUiState
        };
    `)(...names.map((n) => env[n]));
    return { ...run, calls, DATE };
}

describe('명상 중단은 멈추고 처음으로 돌아간다', () => {
    const running = () => ({
        dateStr: '2026-10-15', methodId: 'abdominal_breathing', durationSec: 300,
        status: 'running', remainingSec: 240, endAtMs: Date.now() + 240000
    });

    it('명상 중에 기록을 다시 불러온 뒤에도 중단하면 진행 중이 아니다', () => {
        const m = loadMachine({ timerState: running() });
        m.apply({}, { selectedDateStr: m.DATE });   // 저장·자동 저장 뒤 다시 그림
        expect(m.state().status).toBe('running');   // 타이머는 이어서 돈다
        m.cancel();
        expect(m.state().status).toBe('idle');
        expect(m.state().endAtMs).toBeFalsy();
        expect(m.state().remainingSec).toBe(300);   // 처음 시간으로
    });

    it('일시정지 중에 다시 불러와도 중단하면 처음으로', () => {
        const m = loadMachine({ timerState: { ...running(), status: 'paused', endAtMs: 0, remainingSec: 120 } });
        m.apply({}, { selectedDateStr: m.DATE });
        m.cancel();
        expect(m.state().status).toBe('idle');
        expect(m.state().remainingSec).toBe(300);
    });

    it('타이머가 없으면 지금처럼 저장된 상태 그대로', () => {
        const m = loadMachine({ timerState: null });
        m.apply({}, { selectedDateStr: m.DATE });
        m.cancel();
        expect(m.state().status).toBe('idle');
    });

    it('중단은 돌아갈 상태가 진행 중이면 그리로 가지 않는다', () => {
        const cancel = slice('window.cancelMeditationSession = function', '\nwindow.toggleMeditationSound = function');
        expect(cancel).toContain('!isActiveMeditationStatus(_meditationRestorableState.status)');
    });
});
