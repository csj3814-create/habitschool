import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');

// 2026-09-13 제보: "목표를 달성해서 포인트를 받을 때 성취감이 느껴지도록 팝업을".
// 며칠에서 한 달을 채운 일의 마무리가 토스트 한 줄이었다. 탭과 수령 사이에 축하를
// 한 칸 넣고, '수령하기'를 누르는 동작 자체를 그 순간으로 만든다.
describe('claiming a challenge reward is given a moment', () => {
    const app = read('js/app-core.js');
    const index = read('index.html');

    it('the card opens the celebration instead of claiming straight away', () => {
        expect(app).not.toContain(`onclick="claimChallengeReward('\${tier}')"`);
        const opens = app.split("onclick=\"openChallengeRewardCelebration('${tier}'").length - 1;
        // 수령 대기 카드는 자산 탭과 대시보드 두 군데서 그려진다. 한쪽만 바뀌면 안 된다.
        expect(opens).toBe(2);
    });

    it('the modal exists with the parts the flow drives', () => {
        for (const id of [
            'challenge-reward-modal', 'challenge-reward-emoji', 'challenge-reward-kicker',
            'challenge-reward-title', 'challenge-reward-progress', 'challenge-reward-prizes',
            'challenge-reward-note', 'challenge-reward-claim', 'challenge-reward-close'
        ]) {
            expect(index).toContain(`id="${id}"`);
        }
        expect(index).toContain('onclick="confirmChallengeRewardClaim()"');
    });

    it('promises no amount before the server has decided one', () => {
        const open = app.split('window.openChallengeRewardCelebration =')[1].split('window.closeChallengeRewardModal')[0];
        // 보너스율·정산율이 서버에서 정해진다. 화면이 먼저 약속하면 틀릴 수 있다.
        expect(open).toContain("document.getElementById('challenge-reward-prizes').innerHTML = '';");
        expect(open).not.toContain('받을 HBT');
    });

    it('shows the amounts the server actually returned', () => {
        const confirm = app
            .split('window.confirmChallengeRewardClaim =')[1]
            .split('\n};\n')[0];
        expect(confirm).toContain('Number(result?.rewardHbt)');
        expect(confirm).toContain('Number(result?.rewardPoints)');
        expect(confirm).toContain('받은 HBT');
        expect(confirm).toContain('받은 포인트');
    });

    it('hands the result back from the claim so the modal can read it', () => {
        const claim = read('js/challenge-claim.js');
        // 수령 함수만 본다. 235행의 return true 는 무료 챌린지 '시작' 쪽이라 무관하다.
        const fn = claim.split('export async function claimChallengeReward(')[1].split('\n}\n')[0];
        expect(fn).toContain('return data;');
        // 객체도 참이라 진위값으로 쓰던 자리는 그대로 동작한다.
        expect(fn).not.toContain('return true;');
    });

    it('still claims if the modal markup is ever missing', () => {
        const open = app.split('window.openChallengeRewardCelebration =')[1].split('window.closeChallengeRewardModal')[0];
        // 축하 때문에 보상을 못 받는 일이 있으면 안 된다.
        expect(open).toContain('window.claimChallengeReward?.(tier);');
    });

    it('does not invent its own failure wording', () => {
        const confirm = app
            .split('window.confirmChallengeRewardClaim =')[1]
            .split('\n};\n')[0];
        // 일일 한도 같은 사유는 claimChallengeReward 가 토스트로 정확히 말한다.
        // 축하 화면이 문구를 또 만들면 둘이 서로 다른 말을 하게 된다.
        expect(confirm).toContain('안내 메시지를 확인해 주세요.');
        expect(confirm).not.toContain('showToast(');
    });

    it('respects a reduced-motion preference', () => {
        const css = read('styles-features.css');
        expect(css).toContain('@media (prefers-reduced-motion: reduce)');
        expect(css).toContain('.challenge-reward-burst { animation: none; }');
    });
});
