import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 2026-09-23: 오래 쉰 분들께 보내는 복귀 캠페인을 만들다가, 이미 있던 수동 발송
// 버튼이 위험한 상태인 것을 발견했다.
//
// sendReEngagementEmailsV2 는 "days 일 이상 쉰 사람 전부" 를 대상으로 삼았고,
// 대상 판정이 `if (!lastDate || lastDate < cutoffStr)` 였다. **기록이 한 번도 없는
// 회원 449명이 !lastDate 로 전부 들어온다.** days=7 을 누르면 자동 메일이 이미
// 맡고 있는 7~45일 구간까지 겹쳐서, 회원 623명 중 600명 가까이에게
// "돌아와 주세요" 가 나갈 수 있었다.

const RUNTIME = readRepoFile('functions/runtime.js');
const ADMIN = readRepoFile('admin.html');
const FN = RUNTIME.split('exports.sendReEngagementEmailsV2 = onCall(')[1].split('\n);')[0];

describe('the manual send cannot blast everyone', () => {
    it('never writes to someone who has no record to come back to', () => {
        // 623명 중 449명이 여기 해당한다. 이분들께 필요한 것은 재참여가 아니다.
        expect(FN).toContain('if (!lastDate) return;');
        expect(FN).not.toContain('if (!lastDate || lastDate < cutoffStr) {');
    });

    it('takes a gap range so a campaign can pick its own slice', () => {
        expect(FN).toContain('minGapDays = null, maxGapDays = null');
        expect(FN).toContain('if (gap < minGapDays) return;');
        expect(FN).toContain('if (Number.isFinite(maxGapDays) && gap > maxGapDays) return;');
    });

    it('refuses a range that is backwards', () => {
        expect(FN).toContain('maxGapDays는 minGapDays보다 커야 합니다.');
    });

    it('still behaves as before when no range is given', () => {
        // 기존 3일 / 7일 버튼은 그대로 동작해야 한다.
        expect(FN).toContain('const hasRange = Number.isFinite(minGapDays);');
        expect(FN).toContain('if (lastDate < cutoffStr) {');
    });

    it('shows the real gap in the preview, so the admin can sanity-check it', () => {
        expect(FN).toContain('gapDays: target.gapDays');
    });

    it('knows today before it starts filtering', () => {
        // todayKstStr 이 쓰이는 자리보다 뒤에 선언돼 있으면 필터가 터진다.
        const declaredAt = FN.indexOf('const todayKstStr =');
        const usedAt = FN.indexOf('daysBetweenDateStrings(lastDate, todayKstStr)');
        expect(declaredAt).toBeGreaterThan(-1);
        expect(usedAt).toBeGreaterThan(-1);
        expect(declaredAt).toBeLessThan(usedAt);
    });
});

describe('the console offers the campaign as its own thing', () => {
    const caller = ADMIN.split('window.sendComebackCampaign = async function(minGapDays, maxGapDays) {')[1]
        .split('\n    };')[0];

    it('has a button for each cold band', () => {
        expect(ADMIN).toContain('onclick="sendComebackCampaign(46, 90)"');
        expect(ADMIN).toContain('onclick="sendComebackCampaign(91, 180)"');
    });

    it('previews before it sends, and says how long each person has been gone', () => {
        expect(caller).toContain('preview: true');
        expect(caller).toContain('${t.gapDays}일');
        expect(caller).toContain('confirm(');
    });

    it('sends nothing when the confirm is declined', () => {
        const confirmAt = caller.indexOf('if (!confirm(');
        const sendAt = caller.indexOf('preview: false');
        expect(confirmAt).toBeLessThan(sendAt);
        expect(caller).toContain('return;');
    });

    it('says out loud that nobody without a record is included', () => {
        expect(caller).toContain('기록이 한 번도 없는 분은 대상에서 빠져');
    });

    it('reports a failure instead of a silent success', () => {
        expect(caller).toContain("'오류: ' + e.message");
        expect(caller).toContain('실패 ${errors.length}건');
    });

    it('does not call a slow send a failure', () => {
        // 2026-09-23: 47명에게 보내는 중 화면이 deadline-exceeded 를 띄웠다.
        // 서버는 끝까지 보냈고(47명 전원 도착, 중복 0), 기다리다 포기한 것은
        // 화면뿐이었다. 그걸 실패로 읽으면 다시 누르게 된다.
        expect(caller).toContain("String(e?.code || '').includes('deadline-exceeded')");
        expect(caller).toContain('서버는 계속 보내는 중일 수 있습니다');
        // 다시 눌러도 안전하다는 것까지 말해 준다.
        expect(caller).toContain('오늘 이미 받은 분께는 다시 가지 않습니다');
    });

    it('waits as long as the function is allowed to run', () => {
        // 기본 70초는 한 통씩 보내는 일에 턱없이 짧다.
        expect(caller).toContain("httpsCallable(fns, 'sendReEngagementEmailsV2', { timeout: 540000 })");
        const fn = RUNTIME.split('exports.sendReEngagementEmailsV2 = onCall(')[1].split('async (request)')[0];
        expect(fn).toContain('timeoutSeconds: 540');
    });

    it('puts the button back whatever happens', () => {
        expect(caller).toContain('} finally {');
        expect(caller).toContain('btn.disabled = false;');
    });
});
