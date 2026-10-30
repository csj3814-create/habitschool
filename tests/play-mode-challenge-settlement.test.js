import { describe, expect, it } from 'vitest';
import { readRawRepoFile } from './source-helpers.js';

// 플레이 앱은 블록체인 모듈을 싣지 않는다. 챌린지 정산·포기는 서버 호출뿐이므로
// 그 모듈 없이도 돌아야 한다 (2026-10-30: 플레이 앱에서 '포기' 가 없는 함수를 불렀고,
// 실패한 챌린지가 정산되지 않아 새 챌린지를 시작할 수 없었다).
describe('플레이 앱 챌린지 정산·포기', () => {
    it('블록체인 없는 모듈에 있고, 블록체인 모듈은 이어 주기만 한다', () => {
        const lite = readRawRepoFile('js/challenge-claim.js');
        expect(lite).toContain('export async function settleExpiredChallenges()');
        expect(lite).toContain('export async function forfeitChallenge(tier)');
        expect(lite).not.toMatch(/from ['"][^'"]*(ethers|blockchain-manager)/);
        const chain = readRawRepoFile('js/blockchain-manager.js');
        expect(chain).toMatch(/export \{ settleExpiredChallenges, forfeitChallenge \} from '\.\/challenge-claim\.js/);
        expect(chain).not.toContain('export async function settleExpiredChallenges');
        expect(chain).not.toContain('export async function forfeitChallenge');
    });

    it('블록체인 모듈이 없어도 window 에 걸려 있다', () => {
        const main = readRawRepoFile('js/main.js');
        const stubs = main.slice(0, main.indexOf('window._loadBlockchainModule = function'));
        expect(stubs).toMatch(/window\.settleExpiredChallenges = \(\) => import\('\.\/challenge-claim\.js/);
        expect(stubs).toMatch(/window\.forfeitChallenge = \(tier\) => import\('\.\/challenge-claim\.js/);
    });

    it('로그인·자산 탭의 정산은 블록체인 모듈을 기다리지 않는다', () => {
        const auth = readRawRepoFile('js/auth.js');
        const loginSettle = auth.slice(auth.indexOf('// 10초 뒤 챌린지 정산 점검'), auth.indexOf('}, 10000);'));
        expect(loginSettle).toContain('window.settleExpiredChallenges()');
        expect(loginSettle).not.toContain('_loadBlockchainModule');
        const core = readRawRepoFile('js/app-core.js');
        const settleAt = core.indexOf('if (window.settleExpiredChallenges) Promise.resolve(window.settleExpiredChallenges())');
        const loadAt = core.indexOf("const load = window._loadBlockchainModule || (() => Promise.resolve());");
        expect(settleAt).toBeGreaterThan(0);
        expect(settleAt).toBeLessThan(loadAt);
    });
});
