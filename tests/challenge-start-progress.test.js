import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

const readBlockchainSource = () => readRepoFile('js/blockchain-manager.js');
const readActiveStartFlow = () => readBlockchainSource()
    .split('export async function startChallenge30DWithConnectedWallet(challengeId) {')[1]
    ?.split('\n    return getEffectiveWalletAddress()')[0] || '';

// 증상: 챌린지를 시작하면 한참 아무 소식이 없다가, 다시 누르면 "준비 중"이라 했다가,
// 또 누르면 "7일 챌린지 시작 중"이 떴다.
//
// 잠금 자체는 정상이었다. 문제는 온체인 승인·전송이 수십 초 걸리는데 진행 안내가
// 3.5초 만에 사라져, 사용자 눈에는 아무 일도 안 일어난 것처럼 보인 것이다. 그래서
// 다시 누르고(잠금 → "준비 중"), 그 사이 첫 시도가 끝나 잠금이 풀리고, 또 누르면
// 새 시도가 시작됐다.
describe('challenge start keeps the user informed while it runs', () => {
    it('leaves progress on screen instead of letting it time out', () => {
        const flow = readActiveStartFlow();

        expect(flow).not.toBe('');
        // 진행 안내는 전부 안 사라지는 토스트여야 한다.
        expect(flow).toContain('showChallengeProgress(`⏳ ${duration}일 챌린지 시작 중...`);');
        expect(flow).toContain("showChallengeProgress('🔐 HBT 예치 권한 확인 중...');");
        expect(flow).toContain("showChallengeProgress('⏳ HBT 예치 권한 승인 중... 지갑에서 승인해 주세요.');");
        // 3.5초 뒤 사라지는 기본 토스트로 되돌아가면 안 된다.
        expect(flow).not.toContain('showToast(`⏳ ${duration}일 챌린지 시작 중...`);');
        expect(flow).not.toContain("showToast('🔐 HBT 예치 권한 확인 중...');");
    });

    it('uses the never-dismissing toast the helper already provides', () => {
        const source = readBlockchainSource();

        expect(source).toContain('function showChallengeProgress(message) {');
        expect(source).toContain('showToast(message, { durationMs: 0 });');
    });

    it('clears its own progress note without wiping a failure message', () => {
        const source = readBlockchainSource();
        const cleaner = source
            .split('function clearChallengeProgressIfStale() {')[1]
            ?.split('\n}')[0] || '';

        expect(cleaner).not.toBe('');
        // 화면에 떠 있는 게 우리가 띄운 진행 안내일 때만 걷는다. 실패 안내가
        // 떠 있으면 건드리면 안 된다 — 그게 사용자가 읽어야 할 유일한 메시지다.
        expect(cleaner).toContain('if (toast && toast.innerText === _challengeProgressText) hideToast();');
        expect(readActiveStartFlow()).toContain('clearChallengeProgressIfStale();');
    });

    it('stops the button being pressed again mid-flight', () => {
        const source = readBlockchainSource();
        const flow = readActiveStartFlow();

        // 잠금 메시지를 보여 주는 것보다 못 누르게 하는 편이 헷갈리지 않는다.
        expect(source).toContain('function setChallengeButtonsBusy(busy) {');
        expect(source).toContain('document.querySelectorAll(\'[onclick^="startChallenge30D("]\')');
        expect(flow).toContain('setChallengeButtonsBusy(true);');
        // 어떤 경로로 끝나든 반드시 풀어야 한다. finally가 아니면 버튼이 잠긴 채 남는다.
        const finallyBlock = flow.split('} finally {')[1] || '';
        expect(finallyBlock).toContain('setChallengeButtonsBusy(false);');
        expect(finallyBlock).toContain('clearChallengeProgressIfStale();');
    });
});
