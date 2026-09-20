import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

const APP_CORE_SOURCE = readRepoFile('js/app-core.js');

describe('selected date reload guard', () => {
    it('resets browser-restored record dates to KST today on reload or page restore', () => {
        expect(APP_CORE_SOURCE).toContain('function syncSelectedRecordDateToToday({');
        expect(APP_CORE_SOURCE).toContain('reloadData = false,');
        expect(APP_CORE_SOURCE).toContain("reason = 'manual',");
        expect(APP_CORE_SOURCE).toContain('dateInput.defaultValue = todayStr;');
        expect(APP_CORE_SOURCE).toContain("dateInput.setAttribute('value', todayStr);");
        // 2026-09-20: 저장 직전에는 날짜를 옮기지 않고 '옮겨야 하는 상황인지' 만
        // 알리도록 갈랐다(advance:false). 판정식 자체는 그대로다.
        expect(APP_CORE_SOURCE).toContain('const wouldAdvance = currentDate !== todayStr && shouldChange;');
        expect(APP_CORE_SOURCE).toContain('const changed = wouldAdvance;');
        expect(APP_CORE_SOURCE).toContain('dateInput.value = todayStr;');
        expect(APP_CORE_SOURCE).toContain("window.loadDataForSelectedDate(todayStr)");
        expect(APP_CORE_SOURCE).toContain('let _lastKnownRecordTodayStr = getKstDateString();');
        expect(APP_CORE_SOURCE).toContain('function shouldAutoAdvanceSelectedRecordDate');
        expect(APP_CORE_SOURCE).toContain('function scheduleRecordDateResumeCheck(reason =');
        expect(APP_CORE_SOURCE).toContain("window.addEventListener('focus', () => scheduleRecordDateResumeCheck('focus'));");
        expect(APP_CORE_SOURCE).toContain("if (!document.hidden) scheduleRecordDateResumeCheck('visibility');");
        expect(APP_CORE_SOURCE).toContain('function installRecordDateMediaInputFreshnessGuard');
        expect(APP_CORE_SOURCE).toContain("reason: 'media-input-click'");
        expect(APP_CORE_SOURCE).toContain('function wasRecordDateAutoAdvancedRecently');
        expect(APP_CORE_SOURCE).toContain("getPageNavigationType() === 'reload'");
        expect(APP_CORE_SOURCE).toContain("document.addEventListener('DOMContentLoaded', runIfReload, { once: true });");
        expect(APP_CORE_SOURCE).toContain("window.addEventListener('pageshow', (event) => {");
        expect(APP_CORE_SOURCE).toContain("scheduleRecordDateTodayCheck(event.persisted ? 'pageshow-persisted' : 'pageshow-reload');");
        expect(APP_CORE_SOURCE).toContain("syncSelectedRecordDateToToday({ reloadData: false, reason: 'init' });");
    });
});

// 2026-09-20 제보: "새벽 0시에 동영상 올리던 중에 날짜가 변경되었고 그 뒤 저장을
// 눌렀는데... 어제 날짜 기록이 갤러리 오늘 날짜에도 올라가 있어."
//
// 저장 직전에 선택 날짜를 오늘로 옮기고 있었다. 화면에는 어제 불러온 사진·영상이
// 그대로 있는데 저장 대상만 오늘로 바뀌니, 어제 기록이 통째로 오늘 날짜에
// 복사됐다. 점수는 어제 이미 받은 것이라 오늘 칸은 0점으로 남았다.
describe('a day that turns over mid-edit does not copy itself forward', () => {
    const APP = APP_CORE_SOURCE;
    const save = APP.split("document.getElementById('saveDataBtn').addEventListener('click'")[1];

    it('does not move the date while the form holds that day’s records', () => {
        const preSave = save.split("reason: 'pre-save'")[1].split('});')[0];
        expect(preSave).toContain('advance: false');
    });

    it('saves to the date shown on screen', () => {
        // 화면에 있는 것은 그 날짜의 기록이다.
        const at = save.indexOf("reason: 'pre-save'");
        const after = save.slice(at, at + 1600);
        expect(after).toContain("selectedDateStr = document.getElementById('selected-date').value;");
        // 저장 문서는 화면의 날짜에서 나온다 — 옮겨진 날짜가 아니라.
        expect(after).toContain('docId = `${user.uid}_${selectedDateStr}`;');
    });

    it('tells them afterwards and then moves to today', () => {
        // 숨기면 "오늘 기록했는데 오늘 칸이 비어 있다" 가 된다.
        expect(APP).toContain('function noteRecordDateRolledOver(rolledOver, savedDateStr)');
        const fn = APP.split('function noteRecordDateRolledOver(rolledOver, savedDateStr) {')[1].split('\n}')[0];
        expect(fn).toContain('if (!rolledOver) return;');
        expect(fn).toContain('자정이 지나');
        expect(fn).toContain("reason: 'post-save-rollover'");
        expect(fn).toContain('reloadData: true');
    });

    it('only says it after the write is acknowledged', () => {
        // 저장이 실패했는데 "저장했어요" 라고 하면 안 된다.
        const first = save.indexOf('noteRecordDateRolledOver(dateRolledOverDuringEdit');
        const ack = save.indexOf('primarySaveAcknowledged = true;');
        expect(first).toBeGreaterThan(-1);
        expect(first).toBeGreaterThan(ack);
    });

    it('still lets the page-load path move the date, because that one reloads', () => {
        // 여는 순간의 전환은 데이터를 다시 불러오므로 어제 것이 남지 않는다.
        expect(APP).toContain("const run = () => syncSelectedRecordDateToToday({ reloadData: true, reason });");
    });
});

// 2026-09-20 제보 실패: "제보 전송에 실패했어요 (FIRESTORE (10.8.0) INTERNAL
// ASSERTION FAILED: Unexpected state)". SDK 내부 상태가 깨지면 그 뒤 모든 쓰기가
// 같은 오류로 막히는데, 하필 그때가 제보를 가장 보내고 싶은 순간이다.
describe('a broken connection does not eat the bug report', () => {
    const APP = APP_CORE_SOURCE;
    const fn = APP.split('window.sendBugReport = async function () {')[1].split('\n};')[0];

    it('knows this particular failure by name', () => {
        expect(APP).toContain('function isFirestoreInternalStateError(error)');
        const detector = APP.split('function isFirestoreInternalStateError(error) {')[1].split('\n}')[0];
        expect(detector).toContain('INTERNAL ASSERTION FAILED');
        expect(detector).toContain('Unexpected state');
    });

    it('rebuilds the connection and sends once more', () => {
        expect(fn).toContain("forceFirestoreReconnect('bug-report-retry')");
        const retryAt = fn.indexOf('forceFirestoreReconnect');
        const secondSend = fn.indexOf('submitBugReport', retryAt);
        expect(secondSend).toBeGreaterThan(retryAt);
    });

    it('does not swallow other failures', () => {
        // 권한 문제나 규칙 문제까지 재시도로 뭉개면 원인을 영영 못 본다.
        expect(fn).toContain('if (!isFirestoreInternalStateError(error)) throw error;');
    });

    it('still says it failed when the retry fails too', () => {
        expect(fn).toContain('제보 전송에 실패했어요');
    });
});
