import { describe, expect, it } from 'vitest';
import { readAppSource, readRepoFile } from './source-helpers.js';

// 증상: 하루를 다 기록하고 "공유하시겠어요?"에서 공유를 누르면, 실제보다 낮은
// 점수가 박힌 카드가 나갔다.
//
// 원인: 포인트는 클라이언트가 아는 값이 아니다. daily_logs 쓰기가 끝난 뒤
// 서버 트리거(awardPoints)가 뒤이어 awardedPoints 를 채운다. 유도 시트는 저장
// 900ms 뒤에 로컬 캐시 데이터로 뜨고, 그대로 카드를 구우면 아직 안 채워진 값이 박힌다.
describe('share after save waits for the points the server awards', () => {
    const appSource = readAppSource();

    it('reads the server copy before building the card', () => {
        expect(appSource).toContain('async function waitForAwardedPointsBeforeShare(user, dateStr)');
        // 캐시가 아니라 서버본을 읽어야 방금 붙은 점수가 보인다.
        expect(appSource).toContain("getDocFromServer(doc(db, 'daily_logs', docId))");
        expect(appSource).toContain('function hasAwardedPoints(data)');
    });

    it('retries instead of giving up on the first empty read', () => {
        // 트리거가 도는 데 시간이 걸린다. 한 번 읽고 없으면 그대로 굽던 것이 원인이었다.
        expect(appSource).toContain('const SHARE_AWARD_WAIT_ATTEMPTS = 5;');
        expect(appSource).toContain('const SHARE_AWARD_WAIT_MS = 700;');
        expect(appSource).toContain('for (let attempt = 0; attempt < SHARE_AWARD_WAIT_ATTEMPTS; attempt++)');
    });

    it('still shares if the points never arrive', () => {
        // 점수를 못 받았다고 공유를 막으면 카드 자체를 못 만든다. 기다리되 포기는 한다.
        expect(appSource).toContain('waitForAwardedPointsBeforeShare(user, dateStr)');
        expect(appSource).toContain('.catch(() => false)');
        expect(appSource).toContain('window.shareMyCard?.();');
    });

    it('refreshes the caches the card is built from', () => {
        // 서버본을 읽어 놓고 캐시를 그대로 두면 카드는 여전히 옛 값을 쓴다.
        const fn = appSource.split('async function waitForAwardedPointsBeforeShare(user, dateStr) {')[1]?.split('\n}')[0] || '';
        expect(fn).not.toBe('');
        expect(fn).toContain('updateDailyLogCache(docId, data);');
        expect(fn).toContain('upsertGalleryCacheItem(docId, data);');
        expect(fn).toContain('invalidatePreparedShareMediaCache();');
    });

    it('shares the day the prompt was raised, not whatever today became', () => {
        expect(appSource).toContain('_shareAfterSaveDateStr = dateStr;');
        expect(appSource).toContain('const dateStr = _shareAfterSaveDateStr || getKstDateString();');
    });
});

// 증상: 라이트 버전에서 3일 챌린지를 완주하고 '탭하여 보상 수령'을 눌러도 아무 반응이 없었다.
//
// 원인: 수령 함수는 blockchain-manager 안에만 있었고, main.js 는 그 모듈이 로드된
// 뒤에야 window.claimChallengeReward 를 채웠다. 라이트(플레이) 모드는 온체인 기능을
// 끄느라 그 모듈을 아예 싣지 않으므로, onclick 이 undefined 를 부르고 조용히 끝났다.
describe('challenge reward can be claimed without the blockchain module', () => {
    const mainSource = readRepoFile('js/main.js');
    const claimSource = readRepoFile('js/challenge-claim.js');
    const managerSource = readRepoFile('js/blockchain-manager.js');

    it('needs nothing but the callable', () => {
        // 온체인 서명이 없다. 서버 호출 하나가 전부라 라이트 모드에서도 된다.
        expect(claimSource).toContain("httpsCallable(functions, 'claimChallengeReward', {");
        // 주석에는 이름이 나올 수 있으니 import 만 본다 — 중요한 건 무엇에 의존하느냐다.
        const imports = claimSource
            .split(/\r?\n/)
            .filter((line) => line.trim().startsWith('import '))
            .join(' ');
        expect(imports).not.toBe('');
        expect(imports).not.toContain('ethers');
        expect(imports).not.toContain('blockchain-manager');
    });

    it('is wired up before any module loading, so the button always answers', () => {
        expect(mainSource).toContain('window.claimChallengeReward = (tier) => import(');
        expect(mainSource).toContain('challenge-claim.js?v=336');
        // 모듈 로드가 실패해도 조용히 끝나지 않게 기록은 남긴다.
        expect(mainSource).toContain("console.error('보상 수령 모듈 로드 실패:', error);");
    });

    it('keeps one implementation rather than two', () => {
        expect(managerSource).toContain("export { claimChallengeReward } from './challenge-claim.js?v=336';");
        expect(managerSource).not.toContain('export async function claimChallengeReward(tier) {');
    });

    it('does not promise blockchain minting for the free tier', () => {
        // 무료 미니 챌린지는 포인트만 준다. 라이트 모드에서 '블록체인에서 발행 중'은 거짓말이다.
        expect(claimSource).toContain('function isOnchainTier(tier)');
        expect(claimSource).toContain("return tier !== 'mini';");
        expect(claimSource).toContain("'⏳ 보상을 받는 중이에요…'");
    });

    it('only touches the asset screen when there is one', () => {
        // 라이트 모드에는 자산 탭이 없다.
        expect(claimSource).toContain('if (!window.updateAssetDisplay) return Promise.resolve();');
    });

    it('is precached like the other modules', () => {
        expect(readRepoFile('sw.js')).toContain("'./js/challenge-claim.js?v=336'");
    });
});
