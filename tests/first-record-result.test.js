import { describe, expect, it } from 'vitest';
import { readAppSource, readRepoFile } from './source-helpers.js';

describe('first record result modal', () => {
    it('puts the health-practice meaning before rewards and returns to the weekly mission', () => {
        const html = readRepoFile('index.html');
        const appSource = readAppSource();
        const continueStart = appSource.indexOf('function continueAfterFirstRecord()');
        const continueEnd = appSource.indexOf('// 온보딩 스텝 이동', continueStart);
        const continueSource = appSource.slice(continueStart, continueEnd);

        const titleIndex = html.indexOf('이번 주 건강 목표를 향한 첫 실천을 완료했습니다.');
        const rewardIndex = html.indexOf('이번 기록 포인트');
        expect(titleIndex).toBeGreaterThan(-1);
        expect(rewardIndex).toBeGreaterThan(titleIndex);
        expect(html).toContain('onclick="continueAfterFirstRecord()">이번 주 실천 확인하기</button>');
        expect(continueSource).toContain('openWeeklyMissionArea(false);');
        expect(continueSource).not.toContain("trackProductEvent('first_record_start'");
    });

    it('does not include the first-record reminder prompt or its client handler', () => {
        const html = readRepoFile('index.html');
        const appSource = readAppSource();

        expect(html).not.toContain('first-record-reminder-box');
        expect(html).not.toContain('first-record-reminder-category');
        expect(html).not.toContain('first-record-reminder-time');
        expect(html).not.toContain('내일 기록을 잊지 않게 알려드릴까요?');
        expect(html).not.toContain('내일 이 시간에 알려주세요');
        expect(html).not.toContain('enableFirstRecordReminder');

        expect(appSource).not.toContain('window.enableFirstRecordReminder');
        expect(appSource).not.toContain('function enableFirstRecordReminder');
        expect(appSource).not.toContain("getElementById('first-record-reminder-category')");
        expect(appSource).not.toContain("getElementById('first-record-reminder-time')");
    });

    it('limits the result to a pending new-user first record and consumes it once', () => {
        const appSource = readAppSource();

        expect(appSource).toContain("const FIRST_RECORD_RESULT_PREFIX = 'habitschool_first_record_result_v1';");
        expect(appSource).toContain("return `${FIRST_RECORD_RESULT_PREFIX}_${String(uid || 'unknown')}`;");
        expect(appSource).toContain("if (localStorage.getItem(storageKey) === 'shown') return false;");
        expect(appSource).toContain('userData?.settings?.firstRewardSeenAt');
        expect(appSource).toContain('firstRewardPending !== true');
        expect(appSource).toContain('firstRewardPending: true');
        expect(appSource).toContain("localStorage.setItem(storageKey, 'shown')");
        expect(appSource).toContain('firstRewardSeenAt: serverTimestamp()');
        expect(appSource).toContain('firstRewardPending: deleteField()');
    });

    it('shows the welcome bonus row only when the server confirms it was awarded', () => {
        const html = readRepoFile('index.html');
        const appSource = readAppSource();

        expect(html).toContain('id="first-record-welcome-bonus-row" style="display:none;"');
        expect(appSource).toContain("welcomeBonusRow.style.display = userData?.welcomeBonusGiven === true ? 'flex' : 'none';");
    });
});
