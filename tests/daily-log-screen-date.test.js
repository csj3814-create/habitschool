import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(resolve(ROOT_DIR, 'js/app-core.js'), 'utf8');

// 2026-10-02~05 제보 4건: 날짜를 바꾸면 전날 사진이 새 날짜 화면에 그대로 남았고,
// 한 회원의 10/3 기록은 10/2 저장 4초 뒤에 10/2 의 식단·수면 사진으로 채워져 생겼다.
// 날짜 칸은 이미 새 날짜인데 화면은 아직 전날 것이었고, 저장은 화면의 사진을
// 날짜 칸의 날짜로 적었다.
const fnSource = (name) => {
    const start = APP.indexOf(`function ${name}(`);
    expect(start).toBeGreaterThan(-1);
    const end = APP.indexOf('\n}\n', start);
    return APP.slice(start, end + 2);
};

function loadPreserve({ selectedDate, screenDate, uploading = false, draft = false }) {
    const factory = new Function(
        'getSelectedRecordDateStr', '_runningAiAnalyses', 'hasUploadsInFlight',
        'hasUnsavedExerciseAnalysisOnScreen', 'hasAnyLocalDailyLogMediaDraft', 'window',
        `let _dailyLogScreenDateStr = ${JSON.stringify(screenDate)};
        let _mediaPickerLastDateStr = '';
        ${fnSource('isDailyLogScreenForOtherDate')}
        ${fnSource('shouldPreserveDailyLogMediaUi')}
        return shouldPreserveDailyLogMediaUi;`
    );
    return factory(
        () => selectedDate,
        new Set(),
        () => uploading,
        () => false,
        () => draft,
        { isHabitschoolMediaPickerRecovering: () => false }
    );
}

describe('a day\'s photos never stay on another day\'s screen', () => {
    it('knows the screen belongs to another day only when both dates are known and differ', () => {
        const isOther = new Function(`${fnSource('isDailyLogScreenForOtherDate')} return isDailyLogScreenForOtherDate;`)();
        expect(isOther('2026-10-03', '2026-10-02')).toBe(true);
        expect(isOther('2026-10-03', '2026-10-03')).toBe(false);
        // 아직 아무 날도 그리지 않았으면 막지 않는다 (첫 화면).
        expect(isOther('2026-10-03', '')).toBe(false);
    });

    it('keeps the screen while photos upload on the same day', () => {
        const preserve = loadPreserve({ selectedDate: '2026-10-03', screenDate: '2026-10-03', uploading: true });
        expect(preserve('2026-10-03')).toBe(true);
    });

    it('does not keep yesterday\'s photos when moving to today, even while they still upload', () => {
        const preserve = loadPreserve({ selectedDate: '2026-10-03', screenDate: '2026-10-02', uploading: true, draft: true });
        expect(preserve('2026-10-03')).toBe(false);
    });

    it('records which day the screen shows each time it is drawn', () => {
        expect(APP).toContain(`clearInputs({ preserveMedia: preserveLocalMediaUi });
        _dailyLogScreenDateStr = selectedDateStr;`);
    });

    it('clears another day\'s screen when the new day cannot be read yet', () => {
        const load = fnSource('loadDataForSelectedDate');
        const keep = load.indexOf("keeping current UI while Firestore reconnects");
        const guard = load.lastIndexOf('if (isDailyLogScreenForOtherDate(selectedDateStr)) {', keep);
        expect(guard).toBeGreaterThan(-1);
        expect(load.slice(guard, keep)).toContain('clearInputs();');
    });

    it('refuses to save another day\'s screen under the selected date', () => {
        const guard = APP.indexOf("console.warn('[save] 화면은 다른 날의 기록이라 저장하지 않았다:'");
        const docIdLine = APP.indexOf('docId = `${user.uid}_${selectedDateStr}`;', guard);
        expect(guard).toBeGreaterThan(-1);
        expect(docIdLine).toBeGreaterThan(guard);
        expect(APP.slice(guard - 200, guard)).toContain('if (isDailyLogScreenForOtherDate(selectedDateStr)) {');
        expect(APP.slice(guard, docIdLine)).toContain('return;');
    });
});
