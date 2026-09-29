import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');
const APP = read('js/app-core.js');
const INDEX = read('index.html');

// 2026-09-28·29 제보: "첫번째 식단 사진이 사라져버렸어" · "운동 영상도 사라져버렸어" ·
// "앱을 다시 열어보니 모든 업로드 내용이 사라졌습니다". 세 경우 모두 서버 기록은
// 그대로였다. 인터넷이 느려 서버에 닿지 못한 화면이 아무 말 없이 비어 있거나
// 휴대폰에 남은 옛 기록을 보여 줬다.
const fnSource = (name) => {
    const start = APP.indexOf(`function ${name}(`);
    expect(start).toBeGreaterThan(-1);
    const end = APP.indexOf('\n}\n', start);
    return APP.slice(start, end + 2);
};

function loadNotice({ tab = 'diet', selectedDate = '2026-09-29', en = false } = {}) {
    const textEl = { textContent: '' };
    const retryEl = { textContent: '' };
    const box = {
        hidden: true,
        querySelector: (sel) => (sel.includes('__text') ? textEl : retryEl)
    };
    const document = { getElementById: (id) => (id === 'daily-log-sync-notice' ? box : null) };
    const factory = new Function(
        'document', 'getVisibleTabName', 'getSelectedRecordDateStr', 'isEnglishLocale',
        `let _dailyLogSyncState = { dateStr: '', state: 'ok' };
        ${fnSource('getDailyLogSyncNoticeText')}
        ${fnSource('setDailyLogSyncState')}
        ${fnSource('renderDailyLogSyncNotice')}
        return { setDailyLogSyncState, renderDailyLogSyncNotice };`
    );
    let currentTab = tab;
    const api = factory(document, () => currentTab, () => selectedDate, () => en);
    return { ...api, box, textEl, retryEl, setTab: (t) => { currentTab = t; } };
}

describe('a record the server has not confirmed says so instead of looking deleted', () => {
    it('shows the loading notice when nothing could be read', () => {
        const n = loadNotice();
        n.setDailyLogSyncState('2026-09-29', 'loading');
        expect(n.box.hidden).toBe(false);
        expect(n.textEl.textContent).toContain('아직 불러오지 못했어요');
        expect(n.textEl.textContent).toContain('서버에 안전하게');
        expect(n.retryEl.textContent).toBe('다시 불러오기');
    });

    it('shows the stale notice when the phone copy is on screen', () => {
        const n = loadNotice({ tab: 'exercise' });
        n.setDailyLogSyncState('2026-09-29', 'stale');
        expect(n.box.hidden).toBe(false);
        expect(n.textEl.textContent).toContain('휴대폰에 남아 있던 기록');
    });

    it('disappears once the server answers', () => {
        const n = loadNotice();
        n.setDailyLogSyncState('2026-09-29', 'stale');
        n.setDailyLogSyncState('2026-09-29', 'ok');
        expect(n.box.hidden).toBe(true);
    });

    it('only shows on the record tabs', () => {
        const n = loadNotice({ tab: 'dashboard' });
        n.setDailyLogSyncState('2026-09-29', 'loading');
        expect(n.box.hidden).toBe(true);
        n.setTab('sleep');
        n.renderDailyLogSyncNotice('sleep');
        expect(n.box.hidden).toBe(false);
    });

    it('does not carry one day\'s notice over to another day', () => {
        const n = loadNotice({ selectedDate: '2026-09-30' });
        n.setDailyLogSyncState('2026-09-29', 'loading');
        expect(n.box.hidden).toBe(true);
    });

    it('speaks English on the English app', () => {
        const n = loadNotice({ en: true });
        n.setDailyLogSyncState('2026-09-29', 'loading');
        expect(n.textEl.textContent).toContain('safe on the server');
        expect(n.retryEl.textContent).toBe('Reload');
    });
});

describe('the loader reports which kind of screen it drew', () => {
    const loader = fnSource('loadDataForSelectedDate');

    it('treats an offline cache snapshot as unconfirmed', () => {
        expect(loader).toContain('let confirmedByServer = !myLogDoc.__deferred && !myLogDoc.metadata?.fromCache;');
    });

    it('counts a REST answer from the server as confirmed', () => {
        expect(loader).toMatch(/fallbackData = restResult\.data \|\| \{\};\s+confirmedByServer = true;/);
    });

    it('says "loading" when it keeps an empty screen while reconnecting', () => {
        expect(loader).toMatch(/keeping current UI while Firestore reconnects'\);\s+setDailyLogSyncState\(selectedDateStr, 'loading'\);/);
    });

    it('sets the state after drawing', () => {
        expect(loader).toContain("setDailyLogSyncState(selectedDateStr, confirmedByServer ? 'ok' : 'stale');");
    });

    it('has a place on the page and a retry that resets the automatic limit', () => {
        expect(INDEX).toContain('id="daily-log-sync-notice"');
        expect(INDEX).toContain('onclick="retryDailyLogLoad()"');
        expect(fnSource('retryDailyLogLoad')).toContain('clearDailyLogRetry(');
        expect(fnSource('updateRecordFlowGuides')).toContain('renderDailyLogSyncNotice(activeTab);');
    });
});
