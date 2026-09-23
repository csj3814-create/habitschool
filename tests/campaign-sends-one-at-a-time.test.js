import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 2026-09-23: 46~90일 캠페인을 눌렀다. 대상은 47명, 실제로 나간 것은 22통이었다.
//
// 못 받은 25명의 공백 분포가 받은 쪽과 똑같이 46~89일에 고르게 퍼져 있었다.
// 조건으로 걸러진 것이 아니라 **무작위로 실패한 것**이다.
//
//   보낸 쪽 공백: 46 48 48 56 57 60 62 62 66 66 67 68 69 70 71 71 72 72 75 82 86 88
//   안 간 쪽 공백: 46 46 47 48 49 55 56 61 62 62 63 63 64 66 67 67 69 70 70 73 78 80 81 84 89
//
// 원인은 Promise.allSettled 로 47통을 한꺼번에 던진 것이다. Gmail 이 동시 연결을
// 끊는다. 자동 발송 경로는 처음부터 for 루프로 한 통씩 보내서 이 문제가 없었고,
// 수동 경로만 병렬이었다.

const RUNTIME = readRepoFile('functions/runtime.js');
const V2 = RUNTIME.split('exports.sendReEngagementEmailsV2 = onCall(')[1].split('\n);')[0];

describe('the campaign sends one mail at a time', () => {
    it('does not fire every send at once', () => {
        expect(V2).not.toContain('Promise.allSettled(targets.map');
        expect(V2).toContain('for (const target of targets) {');
    });

    it('waits between sends', () => {
        expect(V2).toContain('await new Promise((resolve) => setTimeout(resolve, REENGAGEMENT_SEND_GAP_MS));');
        expect(RUNTIME).toContain('const REENGAGEMENT_SEND_GAP_MS = 400;');
    });

    it('counts a failure as a failure rather than losing it', () => {
        expect(V2).toContain('sendResults.push({ status: "rejected", reason: error });');
        expect(V2).toContain('sendResults.push({ status: "fulfilled" });');
        // 한 통이 실패해도 나머지는 계속 나가야 한다.
        const loop = V2.split('for (const target of targets) {')[1].split('\n        }')[0];
        expect(loop).toContain('try {');
        expect(loop).toContain('} catch (error) {');
    });

    it('still reports which addresses failed', () => {
        expect(V2).toContain('const sentCount = sendResults.filter((result) => result.status === "fulfilled").length;');
        expect(V2).toContain('email: targets[index].email');
    });
});

describe('pressing the button twice does not mail anyone twice', () => {
    const helper = V2.split('async function sendOneReEngagementMail(target, days, todayStamp) {')[1]
        .split('\n        }')[0];

    it('skips anyone who already got one today', () => {
        // 이게 있어야 실패한 25명만 골라 다시 보낼 수 있다. 없으면 재시도가
        // 이미 받은 22명께 같은 메일을 한 통 더 보내는 일이 된다.
        expect(helper).toContain('const gotItToday = existingHistory.some((entry) => (');
        expect(helper).toContain("String(entry?.sentAt || '').slice(0, 10) === todayStamp"
            .replace(/'/g, '"'));
        expect(helper).toContain('if (gotItToday) {');
    });

    it('checks before it sends, not after', () => {
        const skipAt = helper.indexOf('if (gotItToday) {');
        const sendAt = helper.indexOf('transporter.sendMail(');
        expect(skipAt).toBeGreaterThan(-1);
        expect(sendAt).toBeGreaterThan(-1);
        expect(skipAt).toBeLessThan(sendAt);
    });

    it('does not skip somebody who was mailed on an earlier day', () => {
        // 캠페인은 자동 발송이 포기한 분들께 보내는 일이다. 예전에 한 번 받았다고
        // 영영 대상에서 빼면 캠페인 자체가 성립하지 않는다. 오늘만 본다.
        expect(helper).toContain('todayStamp');
        expect(helper).not.toContain('alreadyNudgedForGap');
    });
});
