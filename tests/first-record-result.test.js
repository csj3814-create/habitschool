import { describe, expect, it } from 'vitest';
import { readAppSource, readRepoFile } from './source-helpers.js';
import { buildRewardGoalView, describeFirstRecordGoal } from '../js/reward-pace.js';

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
        expect(html).toContain('onclick="continueAfterFirstRecord()" data-i18n="firstRecord.continue">이번 주 실천 확인하기</button>');
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

    // 2026-10-14: 가입 직후 첫 기록 창은 "첫 2,000P 쿠폰까지 1,800P 남음" 이라고 했다.
    // 신규 회원에게는 첫 교환 할인(1,400P)이 남아 있고, 자산 탭 카드와 마켓은 그 값을 쓴다.
    it('uses the same coupon target as the assets card and the market', () => {
        const html = readRepoFile('index.html');
        const appSource = readAppSource();
        const showStart = appSource.indexOf('async function maybeShowFirstRecordResult(');
        const showSource = appSource.slice(showStart, appSource.indexOf('function finishFirstRecordResult()', showStart));

        expect(showSource).not.toMatch(/2000\s*-\s*normalizedCurrentPoints/);
        expect(showSource).toContain('await waitForRewardGoalCatalog();');
        expect(showSource).toContain('renderFirstRecordGoalRow();');
        // 목표 문구가 고정 i18n 키면 영어 화면의 DOM 감시가 매번 'To 2,000P' 로 되돌린다
        expect(html).toContain('<dt id="first-record-remaining-label">');
        expect(html).not.toContain('data-i18n="firstRecord.remaining"');

        const row = appSource.slice(appSource.indexOf('function renderFirstRecordGoalRow()'));
        expect(row.slice(0, 800)).toContain('buildRewardGoalView(_firstRecordGoalPoints, getRewardGoalInputs())');
        // 마켓이 늦게 와도 열린 창이 따라온다
        const refresh = appSource.slice(appSource.indexOf('window.refreshAssetRewardGoal = function'));
        expect(refresh.slice(0, 200)).toContain('renderFirstRecordGoalRow();');
        // 기다림은 짧게 — 저장 직후 흐름을 붙잡지 않는다
        expect(appSource).toMatch(/const FIRST_RECORD_GOAL_WAIT_MS = (\d{3,4});/);
        expect(Number(appSource.match(/const FIRST_RECORD_GOAL_WAIT_MS = (\d+);/)[1])).toBeLessThanOrEqual(2000);
    });

    it('describes the discounted first coupon for a new member', () => {
        const catalog = [{ sku: 'coffee', pointCost: 1400, originalPointCost: 2000, firstRedemptionDiscount: true }];
        const view = buildRewardGoalView(200, { catalog });
        expect(describeFirstRecordGoal(view)).toEqual({ label: '첫 교환 1,400P 쿠폰까지', remaining: '1,200P 남음' });
        expect(describeFirstRecordGoal(view, { english: true })).toEqual({
            label: 'To 1,400P (first-exchange price)',
            remaining: '1,200P to go'
        });
    });

    it('falls back to the list price, and says when the coupon is reachable', () => {
        expect(describeFirstRecordGoal(buildRewardGoalView(200, {}))).toEqual({ label: '2,000P 쿠폰까지', remaining: '1,800P 남음' });
        const full = [{ sku: 'coffee', pointCost: 2000 }];
        expect(describeFirstRecordGoal(buildRewardGoalView(2100, { catalog: full }), { english: true }))
            .toEqual({ label: 'To 2,000P', remaining: 'Reached' });
    });

    it('shows the welcome bonus row only when the server confirms it was awarded', () => {
        const html = readRepoFile('index.html');
        const appSource = readAppSource();

        expect(html).toContain('id="first-record-welcome-bonus-row" style="display:none;"');
        expect(appSource).toContain("welcomeBonusRow.style.display = userData?.welcomeBonusGiven === true ? 'flex' : 'none';");
    });
});
