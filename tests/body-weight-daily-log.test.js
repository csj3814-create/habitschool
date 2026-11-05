import { describe, expect, it } from 'vitest';
import { pickBodyWeightForDailyLog } from '../js/le8-score.js';
import { readRepoFile } from './source-helpers.js';

// 2026-11-05 제보: "체중 아침에 쟀는데 그땐 저장된 것 확인 했는데 안 들어가 있어".
// 체성분 사진으로 75kg 을 저장했는데 프로필·체성분 기록에만 있고 그날 기록은 비어 있었다.
const today = '2026-11-05';
const pick = (over) => pickBodyWeightForDailyLog({ recordDate: today, todayStr: today, ...over });

describe('체성분 저장이 그날 기록에 넣는 체중', () => {
    it('사진으로 가져온 체중은 비어 있는 그날 기록에 넣는다', () => {
        expect(pick({ bodyWeight: 75, importedWeight: 75, savedProfileWeight: '75', loggedWeight: '' })).toBe(75);
    });

    it('손으로 바꾼 체중도 넣는다', () => {
        expect(pick({ bodyWeight: 74.2, importedWeight: null, savedProfileWeight: '75' })).toBe(74.2);
    });

    it('처음 넣은 체중도 넣는다', () => {
        expect(pick({ bodyWeight: 74.2, importedWeight: null, savedProfileWeight: '' })).toBe(74.2);
    });

    it('미리 채워져 있던 옛 체중을 그대로 저장하면 오늘 잰 것으로 넣지 않는다', () => {
        expect(pick({ bodyWeight: 75, importedWeight: null, savedProfileWeight: '75' })).toBeNull();
    });

    it('체중 칸이 비어 있어도 가져온 값이 있으면 넣는다', () => {
        expect(pick({ bodyWeight: null, importedWeight: 75, savedProfileWeight: '' })).toBe(75);
    });

    it('체중이 없으면 아무것도 넣지 않는다', () => {
        expect(pick({ bodyWeight: null, importedWeight: null, savedProfileWeight: '75' })).toBeNull();
    });

    it('오늘 기록은 새로 잰 값으로 바꾼다', () => {
        expect(pick({ bodyWeight: 74.8, importedWeight: 74.8, loggedWeight: '75' })).toBe(74.8);
    });

    it('지난 날짜에 이미 있는 체중은 덮지 않고, 비어 있으면 채운다', () => {
        const past = { recordDate: '2026-11-03', bodyWeight: 74.8, importedWeight: 74.8 };
        expect(pick({ ...past, loggedWeight: '75' })).toBeNull();
        expect(pick({ ...past, loggedWeight: '' })).toBe(74.8);
    });

    it('같은 값이면 다시 쓰지 않는다', () => {
        expect(pick({ bodyWeight: 75, importedWeight: 75, loggedWeight: '75' })).toBeNull();
    });
});

describe('체성분 저장과 걸음 캡처의 연결', () => {
    const source = readRepoFile('js/app-core.js');

    it('체성분 기록을 쓴 다음 그날 기록에도 체중을 넣고, 실패하면 알린다', () => {
        const start = source.indexOf('window.saveHealthProfile = async function');
        const body = source.slice(start, source.indexOf('프로필 저장 오류', start));
        expect(body.indexOf('saveBodyWeightToDailyLog(')).toBeGreaterThan(body.indexOf('"inbodyHistory"'));
        expect(body).toContain('if (!dailyLogWeightSaved)');
    });

    // 같은 제보의 콘솔: Cannot set properties of null (setting 'src'). 칸이 화면에서 빠졌다.
    it('걸음 캡처는 미리보기·결과 칸이 없어도 멈추지 않는다', () => {
        const start = source.indexOf('async function handleStepScreenshot');
        const body = source.slice(start, source.indexOf('// Legacy', start));
        expect(body).toContain('if (preview) {');
        expect(body).toContain('if (resultBox) {');
        expect(readRepoFile('index.html')).not.toContain('preview-step-screenshot');
    });
});
