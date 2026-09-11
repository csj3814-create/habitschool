import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readRepoFile = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');

// 2026-09-11 제보: "마스터 챌린지 보상 수령이 100초 넘도록 오래 걸림".
// 함수 로그상 36초 뒤 ExceedsUserDailyCap(0xfeb8983d) 로 되돌려졌다. 그 36초는
// 원금 반환 트랜잭션을 보내고 영수증을 기다린 시간이다. 즉 못 줄 보너스를 위해
// 쓰기를 먼저 보낸 뒤에야 못 준다는 것을 알았다.
describe('challenge claim checks the daily mint cap before it writes anything', () => {
    const source = readRepoFile('functions/runtime.js');

    it('reads the remaining allowance with the contract view', () => {
        expect(source).toContain('getUserDailyRemaining(bonusWalletAddress)');
    });

    it('runs the check before the stake-resolving transaction', () => {
        const checkAt = source.indexOf('getUserDailyRemaining(bonusWalletAddress)');
        const resolveAt = source.indexOf('const { tx: resolveTx } = await resolveChallengeStake(');
        expect(checkAt).toBeGreaterThan(-1);
        expect(resolveAt).toBeGreaterThan(-1);
        // 순서가 뒤집히면 이 수정의 의미가 사라진다. 원금이 이미 온체인으로 나간
        // 뒤 실패하면 챌린지는 claimable 로 남아 어중간한 상태가 된다.
        expect(checkAt).toBeLessThan(resolveAt);
    });

    it('uses a provider, not the signer, so the check cannot spend gas', () => {
        const block = source
            .split('if (bonusRewardHbt > 0) {')[1]
            .split('// 온체인 정산: resolveChallenge')[0];
        expect(block).toContain('const habitReader = getHabitContract(provider);');
        expect(block).not.toContain('getHabitContract(wallet)');
    });

    it('fails open when the allowance cannot be read', () => {
        const block = source
            .split('if (bonusRewardHbt > 0) {')[1]
            .split('// 온체인 정산: resolveChallenge')[0];
        // 한도를 못 읽은 것으로 수령을 막으면, 빠르게 실패시키려던 것이 새 장애가 된다.
        expect(block).toContain('if (capCheckError instanceof HttpsError) throw capCheckError;');
        expect(block).toContain('console.warn(');
    });

    it('tells the user the numbers, with the code the client already renders verbatim', () => {
        const block = source
            .split('if (bonusRewardHbt > 0) {')[1]
            .split('// 온체인 정산: resolveChallenge')[0];
        expect(block).toContain('"failed-precondition"');
        expect(block).toContain('남은 한도');
        // 클라이언트는 failed-precondition 일 때만 서버 문구를 그대로 보여준다.
        const client = readRepoFile('js/challenge-claim.js');
        expect(client).toContain("code === 'failed-precondition'");
    });
});
