import { describe, expect, it } from 'vitest';
import { readAppSource } from './source-helpers.js';

const APP = readAppSource();
const fnSource = (name) => {
    const start = APP.indexOf(`function ${name}(`);
    expect(start).toBeGreaterThan(-1);
    return APP.slice(start, APP.indexOf('\n}\n', start) + 2);
};
const classify = new Function(`${fnSource('classifyHealthConnectSyncReturn')} return classifyHealthConnectSyncReturn;`)();

// 2026-10-06 제보: "Health Connect 다시 가져오기 눌러도 7962보에서 변하질 않네." 앱이 새로
// 읽었는데 숫자가 같았는지, 새 숫자가 웹까지 오지 못했는지 가를 기록이 없었다.
describe('after "다시 가져오기" the app says what actually came back', () => {
    const request = { at: Date.parse('2026-10-06T12:56:00Z'), previousCount: 7962 };

    it('calls it unchanged when a fresh read brought the same number', () => {
        expect(classify(request, { stepCount: 7962, syncedAtEpochMillis: Date.parse('2026-10-06T12:56:05Z') })).toBe('unchanged');
    });

    it('calls it missing when only the earlier read is on screen', () => {
        expect(classify(request, { stepCount: 7962, syncedAtEpochMillis: Date.parse('2026-10-06T12:54:00Z') })).toBe('missing');
        expect(classify(request, null)).toBe('missing');
    });

    it('calls it updated when a new number arrived', () => {
        expect(classify(request, { stepCount: 8107, syncedAtEpochMillis: Date.parse('2026-10-06T12:56:05Z') })).toBe('updated');
    });

    it('remembers the press, checks on return, and tells the person', () => {
        const start = fnSource('startNativeHealthConnectSync');
        expect(start.indexOf('rememberHealthConnectSyncRequest(')).toBeLessThan(start.indexOf('window.location.href = syncUrl.toString();'));
        const report = fnSource('reportHealthConnectSyncReturn');
        expect(report).toContain("console.warn('[health-connect] 다시 가져오기 결과 ' + detail);");
        expect(report).toContain('Health Connect 에 아직 새 걸음수가 없어요');
        expect(report).toContain('새 걸음수를 받지 못했어요');
        expect(APP).toContain("window.addEventListener('pageshow', scheduleHealthConnectSyncReturnCheck);");
    });
});
