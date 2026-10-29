import { describe, expect, it } from 'vitest';
import { readRawRepoFile, readRepoFile } from './source-helpers.js';

// E6-5 다 (2026-10-30): 영어 앱에 남은 한국어 두 곳.
// - 체성분 CSV 를 들여올 때 확인 창의 "읽은 항목"이 한국어 이름(체중·골격근량…)으로 나왔다.
// - 친구 연속 기록 알림에 이름이 없으면 서버가 '친구' 를 넣어, 영어 회원에게 "🔥 친구 logged…" 가 갈 뻔했다.

const CSV = readRepoFile('js/body-composition-csv.js');
// readRepoFile 은 t('키') 를 한국어로 펼쳐 읽는다. 키 자체를 봐야 해서 원문으로.
const APP = readRawRepoFile('js/app-core.js');
const RUNTIME = readRepoFile('functions/runtime.js');
const KO = readRepoFile('js/i18n-ko.js');
const EN = readRepoFile('js/i18n-en.js');

const fieldLabels = Object.fromEntries(
    [...CSV.split('const FIELD_LABELS = Object.freeze({')[1].split('});')[0].matchAll(/(\w+):\s*'([^']+)'/g)]
        .map((m) => [m[1], m[2]])
);
const valueOf = (dict, key) => dict.match(new RegExp(`'${key.replace(/\./g, '\\.')}':\\s*'([^']*)'`))?.[1];

describe('body composition CSV field names follow the member language', () => {
    const fields = Object.keys(fieldLabels).filter((field) => field !== 'date');

    it('has a key for every field the parser can match', () => {
        expect(fields.length).toBeGreaterThanOrEqual(10);
        fields.forEach((field) => {
            // 한국어는 예전 화면과 글자 그대로.
            expect(valueOf(KO, `profile.csv.field.${field}`), field).toBe(fieldLabels[field]);
            const en = valueOf(EN, `profile.csv.field.${field}`);
            expect(en, field).toBeTruthy();
            expect(en, field).not.toMatch(/[가-힣]/);
        });
    });

    it('builds the confirm list from those keys, not the parser label', () => {
        const confirmFn = APP.slice(APP.indexOf('function confirmBodyCompositionImport('), APP.indexOf('async function writeBodyCompositionRows('));
        expect(confirmFn).toContain('t(`profile.csv.field.${entry.field}`)');
        expect(confirmFn).not.toContain('.map((entry) => entry.label)');
    });
});

describe('friend streak notice without a name', () => {
    it('leaves the name empty on the server and fills it in the reader language', () => {
        const notify = RUNTIME.slice(RUNTIME.indexOf('async function notifyFriendsOnStreak('), RUNTIME.indexOf('// 추천인 마일스톤 보상'));
        expect(notify).not.toContain("|| '친구'");
        expect(APP).toContain("name: n.fromUserName || t('community.friendStreakNoName')");
        expect(valueOf(KO, 'community.friendStreakNoName')).toBe('친구');
        expect(valueOf(EN, 'community.friendStreakNoName')).toBe('A friend');
    });
});

// 2026-10-30 영어 스크린샷에서: 자산 탭 "새 챌린지 시작하기" 를 펴면 단추가 "📋 접기" 로 바뀌었다(한국어 고정).
describe('challenge picker toggle follows the member language', () => {
    it('uses the keys both ways', () => {
        const MAIN = readRawRepoFile('js/main.js');
        expect(MAIN).toContain("text.textContent = isHidden ? t('assets.challenge.collapse') : t('assets.challenge.startNew');");
        expect(valueOf(KO, 'assets.challenge.collapse')).toBe('📋 접기');
        expect(valueOf(EN, 'assets.challenge.collapse')).toBe('📋 Collapse');
    });
});
