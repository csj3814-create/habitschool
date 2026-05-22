import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

const APP_CORE_SOURCE = readRepoFile('js/app-core.js');

describe('selected date reload guard', () => {
    it('resets browser-restored record dates to KST today on reload or page restore', () => {
        expect(APP_CORE_SOURCE).toContain('function syncSelectedRecordDateToToday({ reloadData = false, reason =');
        expect(APP_CORE_SOURCE).toContain('dateInput.defaultValue = todayStr;');
        expect(APP_CORE_SOURCE).toContain("dateInput.setAttribute('value', todayStr);");
        expect(APP_CORE_SOURCE).toContain('const changed = currentDate !== todayStr;');
        expect(APP_CORE_SOURCE).toContain('dateInput.value = todayStr;');
        expect(APP_CORE_SOURCE).toContain("window.loadDataForSelectedDate(todayStr)");
        expect(APP_CORE_SOURCE).toContain("getPageNavigationType() === 'reload'");
        expect(APP_CORE_SOURCE).toContain("document.addEventListener('DOMContentLoaded', runIfReload, { once: true });");
        expect(APP_CORE_SOURCE).toContain("window.addEventListener('pageshow', (event) => {");
        expect(APP_CORE_SOURCE).toContain("scheduleRecordDateTodayCheck(event.persisted ? 'pageshow-persisted' : 'pageshow-reload');");
        expect(APP_CORE_SOURCE).toContain("syncSelectedRecordDateToToday({ reloadData: false, reason: 'init' });");
    });
});
