import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 증상: 마스터 챌린지 보상 수령을 눌렀더니 70초를 세고는 "보상 수령에 실패했습니다.
// (deadline-exceeded)" 가 떴다. 그런데 실제로는 30,000 HBT 가 지급돼 있었다.
//
// 원인: Firebase 콜러블의 기본 대기 시간은 70초인데 서버의 claimChallengeReward 는
// timeoutSeconds: 300 으로 선언돼 있다. 온체인 발행이 70초를 넘기면 클라이언트만
// 먼저 포기한다. 서버는 끝까지 가서 보상을 준다. deadline-exceeded 는 "서버가 실패"가
// 아니라 "클라이언트가 기다리기를 그만뒀다"는 뜻인데, 실패로 단정해 버렸다.

const CLAIM = readRepoFile('js/challenge-claim.js');
const RUNTIME = readRepoFile('functions/runtime.js');

describe('the client waits as long as the server is allowed to run', () => {
    it('reads the same ceiling the server declares', () => {
        const serverBlock = RUNTIME.split('exports.claimChallengeReward = onCall(')[1].split(')')[0];
        const serverSeconds = Number(serverBlock.match(/timeoutSeconds:\s*(\d+)/)[1]);
        const clientMs = Number(CLAIM.match(/const CLAIM_CALL_TIMEOUT_MS = ([\d_]+);/)[1].replace(/_/g, ''));
        // 클라이언트가 먼저 포기하면 서버의 성공을 실패로 보고하게 된다.
        expect(clientMs).toBeGreaterThanOrEqual(serverSeconds * 1000);
    });

    it('actually passes that timeout to the callable', () => {
        // 기본값 70초를 그대로 두면 상수를 선언해 봐야 소용이 없다.
        expect(CLAIM).toContain("httpsCallable(functions, 'claimChallengeReward', {");
        expect(CLAIM).toContain('timeout: CLAIM_CALL_TIMEOUT_MS');
    });
});

describe('a client-side timeout is never reported as a failure', () => {
    it('is handled before the generic failure message', () => {
        const handler = CLAIM.split('} catch (error) {')[1];
        const deadlineAt = handler.indexOf("code === 'deadline-exceeded'");
        const failMsgAt = handler.indexOf('보상 수령에 실패했습니다');
        expect(deadlineAt).toBeGreaterThan(-1);
        expect(failMsgAt).toBeGreaterThan(-1);
        expect(deadlineAt).toBeLessThan(failMsgAt);
    });

    it('says it is still running, and does not say it failed', () => {
        const branch = CLAIM.split("if (code === 'deadline-exceeded') {")[1].split('\n        }')[0];
        expect(branch).toContain('보상 발행이 아직 진행 중이에요');
        expect(branch).not.toContain('실패');
        expect(branch).not.toContain('❌');
    });

    it('checks the result instead of guessing at it', () => {
        const branch = CLAIM.split("if (code === 'deadline-exceeded') {")[1].split('\n        }')[0];
        expect(branch).toContain('await refreshAfterClaim();');
    });
});

describe('the reward shows up without leaving the app', () => {
    it('re-reads more than once, since the mint lands after the call returns', () => {
        expect(CLAIM).toContain('const CLAIM_REFRESH_DELAYS_MS = [0, 15_000, 45_000];');
        expect(CLAIM).toContain('function refreshAfterClaim()');
        expect(CLAIM).toContain('window.updateAssetDisplay(true)');
    });

    it('forces a server read rather than accepting the cache', () => {
        const fn = CLAIM.split('function refreshAfterClaim() {')[1].split('\n}')[0];
        expect(fn).toContain('updateAssetDisplay(true)');
        expect(fn).not.toContain('updateAssetDisplay()');
    });

    it('stops if the user signs out mid-wait', () => {
        const fn = CLAIM.split('function refreshAfterClaim() {')[1].split('\n}')[0];
        expect(fn).toContain('if (!auth.currentUser || !window.updateAssetDisplay) return resolve();');
    });

    it('still does nothing at all in Lite mode, which has no asset tab', () => {
        expect(CLAIM).toContain('if (!window.updateAssetDisplay) return Promise.resolve();');
    });
});

describe('the waiting message stays honest as it drags on', () => {
    it('stops promising 30 seconds to a minute once that has passed', () => {
        expect(CLAIM).toContain('const body = elapsed <= 90');
        expect(CLAIM).toContain('블록체인이 붐벼 조금 더 걸리고 있어요');
        // 오래 걸릴 때 정말로 필요한 정보는 "나가도 보상은 들어온다"는 것이다.
        expect(CLAIM).toContain('창을 닫아도 보상은 들어옵니다');
    });
});
