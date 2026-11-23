import { describe, expect, it } from 'vitest';
import { readRawRepoFile, readRepoFile } from './source-helpers.js';
import {
    isSecondRecordDay,
    nextMealReminderHour,
    secondRecordReminderHour,
    shouldOfferSecondRecordReminder,
} from '../js/first-record-return.js';
import { getActiveDateSet } from '../js/activity-days.js';

// t('키') 를 한국어로 펼치지 않은 원문 — 상자 코드를 떼어 돌릴 때 어느 키를 썼는지 보려고.
const app = readRawRepoFile('js/app-core.js');

const TODAY = '2026-11-24';
const active = (date) => ({ date, awardedPoints: { dietPoints: 10 } });

// 식단 탭 상자 코드(let _firstRecordNudgeUid ~ updateRecordFlowGuides 앞)를 떼어 돌린다.
function loadBox({ uid = 'me', logs = [], inPlayApp = true, hour = 9, photos = [] } = {}) {
    const start = app.indexOf("let _firstRecordNudgeUid = '';");
    const end = app.indexOf('function updateRecordFlowGuides(', start);
    const title = { textContent: '', key: '', setAttribute(_, v) { this.key = v; } };
    const desc = { textContent: '', key: '', setAttribute(_, v) { this.key = v; } };
    const nudge = { hidden: true, dataset: {}, querySelector: (sel) => (sel === 'strong' ? title : desc) };
    const reminder = { hidden: true };
    const ask = { textContent: '' };
    const els = { 'diet-first-record-nudge': nudge, 'diet-second-record-reminder': reminder, 'diet-second-record-reminder-ask': ask };
    const writes = [];
    const enabled = [];
    let pending = Promise.resolve();
    // eslint-disable-next-line no-new-func
    const api = new Function(
        'document', 'auth', '_hasPreviewImage', 'hasStartedRecording', 't',
        'getDocs', 'query', 'collection', 'where', 'limit', 'db',
        'getActiveDateSet', 'isSecondRecordDay', 'getKstDateString', 'shouldOfferSecondRecordReminder',
        'getFirstRecordReturnContext', 'secondRecordReminderHour', 'getKstHour',
        'setDoc', 'doc', 'serverTimestamp', 'enableFirstRecordReminder',
        `const DIET_SLOTS = Object.freeze(['breakfast', 'lunch', 'dinner', 'snack', 'meal5', 'meal6']);\n${app.slice(start, end)}
        return { syncFirstRecordNudge, acceptSecondRecordReminder, skipSecondRecordReminder, renderFirstRecordNudge };`
    )(
        { getElementById: (id) => els[id] || null },
        { currentUser: uid ? { uid } : null },
        (id) => photos.includes(id),
        (data) => !!data.lastLogDate,
        (key, params = {}) => (params.hour ? `${key}@${params.hour}` : key),
        () => {
            const docs = logs.map((log) => ({ data: () => log }));
            pending = Promise.resolve({ docs, size: docs.length });
            return pending;
        },
        () => ({}), () => ({}), () => ({}), () => ({}), {},
        getActiveDateSet, isSecondRecordDay, () => TODAY, shouldOfferSecondRecordReminder,
        () => ({ inPlayApp }), secondRecordReminderHour, () => hour,
        (_ref, data) => { writes.push(data); return Promise.resolve(); },
        () => ({}), () => 'SERVER_TIME',
        (h, options) => enabled.push({ h, options })
    );
    const sync = async (userData) => {
        api.syncFirstRecordNudge(uid || 'me', userData);
        await pending;
        await new Promise((resolve) => setTimeout(resolve, 0));
    };
    return { api, sync, nudge, title, desc, reminder, ask, writes, enabled };
}

const oneDayMember = { lastLogDate: '2026-11-22', currentStreak: 1 };

// 2026-11-23 설계 4-1: 첫 기록한 사람 중 다른 날 한 번 더 기록한 사람은 대략 30% 였다.
// 기록이 1번인 회원에게는 아무 안내도 없었다. 식단 탭 맨 위 같은 자리에서 둘째 기록을 권한다.
describe('기록한 날이 하루뿐인지', () => {
    it('하루뿐이고 그날이 오늘 전이면 권한다', () => {
        expect(isSecondRecordDay({ activeDates: ['2026-11-22'], todayStr: TODAY })).toBe(true);
    });

    it('첫 기록 당일에는 권하지 않는다', () => {
        expect(isSecondRecordDay({ activeDates: [TODAY], todayStr: TODAY })).toBe(false);
    });

    it('이틀 이상 기록했거나 기록이 없으면 아니다', () => {
        expect(isSecondRecordDay({ activeDates: ['2026-11-20', '2026-11-22'], todayStr: TODAY })).toBe(false);
        expect(isSecondRecordDay({ activeDates: [], todayStr: TODAY })).toBe(false);
    });

    it('기록을 다 읽지 못했으면 알 수 없으니 권하지 않는다', () => {
        expect(isSecondRecordDay({ activeDates: ['2026-11-22'], todayStr: TODAY, complete: false })).toBe(false);
    });
});

describe('식단 탭 둘째 기록 상자', () => {
    it('기록한 날이 하루뿐인 회원에게 둘째 기록 문구로 보인다', async () => {
        const box = loadBox({ logs: [active('2026-11-22')] });
        await box.sync(oneDayMember);
        expect(box.nudge.hidden).toBe(false);
        expect(box.nudge.dataset.mode).toBe('second');
        expect(box.title.key).toBe('diet.secondRecordNudge.title');
        expect(box.desc.key).toBe('diet.secondRecordNudge.desc');
    });

    it('오늘 이미 기록했으면 숨는다 — 첫 기록 당일 포함', async () => {
        const box = loadBox({ logs: [active(TODAY)] });
        await box.sync({ lastLogDate: TODAY, currentStreak: 1 });
        expect(box.nudge.hidden).toBe(true);
    });

    it('이틀 이상 기록한 회원에게는 안 보인다', async () => {
        const box = loadBox({ logs: [active('2026-11-20'), active('2026-11-22')] });
        await box.sync(oneDayMember);
        expect(box.nudge.hidden).toBe(true);
    });

    it('포인트가 붙지 않은 빈 기록 문서는 기록한 날로 치지 않는다', async () => {
        const box = loadBox({ logs: [active('2026-11-22'), { date: '2026-11-21', awardedPoints: {} }] });
        await box.sync(oneDayMember);
        expect(box.nudge.hidden).toBe(false);
    });

    it('저장된 연속 기록이 이틀 넘는 회원은 기록 문서를 읽지도 않는다', () => {
        const fn = app.slice(app.indexOf('function syncFirstRecordNudge('), app.indexOf('async function syncSecondRecordNudge('));
        expect(fn).toContain('(Number(userData?.currentStreak) || 0) > 1) return;');
    });

    it('기록 문서는 몇 개만 읽는다', () => {
        const fn = app.slice(app.indexOf('async function syncSecondRecordNudge('), app.indexOf('function recordSecondRecordPrompt('));
        expect(fn).toContain("where('userId', '==', uid)");
        expect(fn).toContain('limit(SECOND_RECORD_LOG_PEEK)');
        expect(fn).toContain('complete: snapshot.size < SECOND_RECORD_LOG_PEEK');
    });

    it('기록이 없는 회원에게는 예전 첫 기록 문구 그대로', async () => {
        const box = loadBox();
        await box.sync({});
        expect(box.nudge.hidden).toBe(false);
        expect(box.title.key).toBe('diet.firstRecordNudge.title');
        expect(box.reminder.hidden).toBe(true);
    });

    it('저장에 성공하면 둘째 기록 상자도 사라진다', () => {
        const save = app.indexOf("trackFirstRecordStep('first_record_save_ok'");
        expect(app.slice(save, save + 260)).toContain("_secondRecordNudgeUid = '';");
    });
});

describe('둘째 기록 상자 아래 알림 줄', () => {
    it('플레이 앱에서 습관 알림이 꺼진 회원에게 지금 시각으로 묻는다', async () => {
        const box = loadBox({ logs: [active('2026-11-22')], hour: 9 });
        await box.sync(oneDayMember);
        expect(box.reminder.hidden).toBe(false);
        expect(box.ask.textContent).toBe('diet.secondRecordNudge.reminderAsk@9');
    });

    it('웹, 이미 알림을 켠 회원, 한 번 답한 회원에게는 묻지 않는다', async () => {
        const web = loadBox({ logs: [active('2026-11-22')], inPlayApp: false });
        await web.sync(oneDayMember);
        expect(web.reminder.hidden).toBe(true);
        const on = loadBox({ logs: [active('2026-11-22')] });
        await on.sync({ ...oneDayMember, settings: { reminderPreference: { enabled: true } } });
        expect(on.reminder.hidden).toBe(true);
        const answered = loadBox({ logs: [active('2026-11-22')] });
        await answered.sync({ ...oneDayMember, settings: { secondRecordPrompt: { choice: 'skip' } } });
        expect(answered.reminder.hidden).toBe(true);
    });

    it('알림 받기 — 답을 따로 남기고, 허락 결과도 결과 창 칸이 아닌 이 칸에 남긴다', async () => {
        const box = loadBox({ logs: [active('2026-11-22')], hour: 9 });
        await box.sync(oneDayMember);
        box.api.acceptSecondRecordReminder();
        expect(box.reminder.hidden).toBe(true);
        expect(box.writes).toEqual([{ settings: { secondRecordPrompt: { choice: 'accept', hourKst: 9, at: 'SERVER_TIME' } } }]);
        expect(box.enabled).toHaveLength(1);
        expect(box.enabled[0].h).toBe(9);
        box.enabled[0].options.record({ result: 'granted' });
        expect(box.writes[1]).toEqual({ settings: { secondRecordPrompt: { result: 'granted' } } });
    });

    it('나중에 — 줄을 숨기고 다시 묻지 않도록 남긴다', async () => {
        const box = loadBox({ logs: [active('2026-11-22')] });
        await box.sync(oneDayMember);
        box.api.skipSecondRecordReminder();
        expect(box.reminder.hidden).toBe(true);
        expect(box.nudge.hidden).toBe(false);
        expect(box.writes).toEqual([{ settings: { secondRecordPrompt: { choice: 'skip', at: 'SERVER_TIME' } } }]);
        expect(box.enabled).toHaveLength(0);
    });

    it('밤과 새벽에 다시 열면 끼니 시각으로 옮긴다', () => {
        expect(secondRecordReminderHour(9)).toBe(9);
        expect(secondRecordReminderHour(21)).toBe(21);
        expect(secondRecordReminderHour(23)).toBe(nextMealReminderHour(23));
        expect(secondRecordReminderHour(6)).toBe(12);
    });

    it('플레이 앱·알림 꺼짐·답 없음일 때만', () => {
        expect(shouldOfferSecondRecordReminder({ inPlayApp: true })).toBe(true);
        expect(shouldOfferSecondRecordReminder({ inPlayApp: false })).toBe(false);
        expect(shouldOfferSecondRecordReminder({ inPlayApp: true, reminderEnabled: true })).toBe(false);
        expect(shouldOfferSecondRecordReminder({ inPlayApp: true, prompt: { choice: 'accept' } })).toBe(false);
    });

    it('쓰기 실패를 삼키지 않는다 (2026-08 consents 사고)', () => {
        const fn = app.slice(app.indexOf('function recordSecondRecordPrompt('), app.indexOf('function acceptSecondRecordReminder('));
        expect(fn).toContain('{ merge: true }');
        expect(fn).toContain('console.warn(');
        expect(fn).not.toContain('.catch(() => {})');
    });

    it('settings 는 회원이 쓸 수 있는 필드라 새 하위 값이 규칙에 막히지 않는다', () => {
        const rules = readRepoFile('firestore.rules');
        const whitelist = rules.split('function isAllowedUserField() {')[1].split('\n    }')[0];
        expect(whitelist).toContain("'settings'");
        expect(rules).not.toMatch(/data\.settings\b/);
    });
});

describe('두 앱의 화면과 문구', () => {
    for (const [file, i18n] of [['index.html', 'js/i18n-ko.js'], ['en/index.html', 'js/i18n-en.js']]) {
        it(file, () => {
            const page = readRepoFile(file);
            const box = page.slice(page.indexOf('id="diet-first-record-nudge"'), page.indexOf('class="record-flow-card" data-record-guide="diet"'));
            expect(box).toMatch(/id="diet-second-record-reminder"[^>]*\shidden/);
            expect(box).toContain('onclick="acceptSecondRecordReminder()"');
            expect(box).toContain('onclick="skipSecondRecordReminder()"');
            const messages = readRepoFile(i18n);
            for (const key of ['title', 'desc', 'reminderAsk', 'reminderOn', 'reminderLater']) {
                expect(messages).toContain(`'diet.secondRecordNudge.${key}':`);
            }
            expect(messages).toMatch(/'diet\.secondRecordNudge\.reminderAsk': '[^']*\{hour\}/);
        });
    }

    it('한국어 문구는 설계대로', () => {
        const ko = readRepoFile('js/i18n-ko.js');
        expect(ko).toContain("'diet.secondRecordNudge.title': '오늘 한 장이면 이틀째예요'");
        expect(ko).toContain("'diet.secondRecordNudge.desc': '지난번처럼 지금 눈앞의 것 한 장이면 돼요.'");
    });

    it('단추는 전역으로 열려 있다', () => {
        expect(app).toContain('window.acceptSecondRecordReminder = acceptSecondRecordReminder;');
        expect(app).toContain('window.skipSecondRecordReminder = skipSecondRecordReminder;');
    });
});
