import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtime = readFileSync(resolve(ROOT_DIR, 'functions/runtime.js'), 'utf8');

// 2026-09-12 제보: "온체인 챌린지 예치 내역을 찾을 수 없습니다".
// 전날 보상 수령이 일일 한도에서 실패했는데, 원금 반환 거래는 이미 나간 뒤였다.
// 그래서 온체인은 settled, Firestore 는 수령 대기인 상태가 남았다. legacy 경로는
// NoStakeFound 를 "이미 정산됨"으로 보고 통과시키는데 티어 경로에만 그 처리가 없어,
// 재시도할 때마다 같은 자리에서 막혔다.
describe('a challenge already settled on chain can still be cleared', () => {
    it('tells "already settled" apart from "no stake was ever recorded"', () => {
        const fn = runtime
            .split('async function syncTieredChallengeProgress(')[1]
            .split('\n}\n')[0];
        expect(fn).toContain('if (onchain.settled) {');
        expect(fn).toContain('TIERED_STAKE_ALREADY_SETTLED');
        // 예치 기록이 없는 경우는 성격이 달라 계속 막아야 한다.
        expect(fn).toContain('if (onchain.totalDays === 0) {');
        expect(fn).toContain('온체인 챌린지 예치 내역을 찾을 수 없습니다.');
    });

    it('carries the signal as a plain error so the handler can see it', () => {
        // HttpsError 였기 때문에 수령 핸들러가 그대로 재던졌다. 표식은 평범한 Error 여야 한다.
        const fn = runtime
            .split('async function syncTieredChallengeProgress(')[1]
            .split('\n}\n')[0];
        expect(fn).toContain('new Error("Tiered challenge already settled on-chain")');
        expect(fn).not.toContain('new HttpsError("failed-precondition", "온체인 챌린지 예치 내역을 찾을 수 없습니다.");\n        settledError');
    });

    it('judges both contract paths in one place', () => {
        expect(runtime).toContain('function isChallengeAlreadySettledError(error)');
        expect(runtime).toContain("error?.errorName === 'NoStakeFound'");
        expect(runtime).toContain("0x59be8f02");
        // 셀렉터 판정이 여기저기 복사돼 있으면 한쪽만 고쳐질 수 있다.
        expect(runtime.split('0x59be8f02').length - 1).toBe(1);
    });

    it('checks already-settled before re-throwing, on both settlement paths', () => {
        for (const [, block] of [
            ['claim', runtime.split('온체인 정산 오류:')[0]],
            ['failure', runtime.split('온체인 소각 정산 오류:')[0]]
        ]) {
            const at = block.lastIndexOf('isChallengeAlreadySettledError(onChainErr)');
            const rethrow = block.lastIndexOf('onChainErr instanceof HttpsError');
            expect(at).toBeGreaterThan(-1);
            expect(at).toBeLessThan(rethrow);
        }
    });

    it('never re-pays a principal that already went back', () => {
        const claim = runtime.split('isChallengeAlreadySettledError(onChainErr)')[1].split('} else if')[0];
        expect(claim).toContain('principalPaidHbt = 0;');
        expect(claim).toContain('rewardHbt = bonusRewardHbt;');
    });
});
