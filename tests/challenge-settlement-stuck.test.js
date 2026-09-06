import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

const APP = readRepoFile('js/app-core.js');
const PANEL = APP.split('function renderAssetChallengePanel(')[1].split('\nfunction ')[0];

// 3일 미니를 3/3 채웠는데 "정산 확인 중…" 에서 멈춰 보상 수령이 안 됐다.
// 새로고침해도 그대로였고, 앱을 껐다 켜야 풀렸다 — 로그인 10초 뒤 타이머가
// 그제서야 재계산을 걸었기 때문이다.
describe('정산 확인 중에서 멈추지 않는다', () => {
    it('확인 중이라고 말할 때 실제로 확인을 요청한다', () => {
        // 예전에는 문구만 바꾸고 기다렸다.
        expect(PANEL).toContain("requestAssetChallengeProgressSync(\n                    auth.currentUser?.uid, todayStr, 'challenge-awaiting-settlement')");
    });

    it('요청은 그 상태일 때만 나간다', () => {
        expect(PANEL).toContain('if (isAwaitingSettlement) {');
    });

    it('일수를 다 채운 경우도 정산 대기로 본다', () => {
        // 마지막 날 전에 완주하면 endDate 는 아직 미래라, 기간 조건만으로는 안 잡혔다.
        expect(PANEL).toContain("const isAwaitingSettlement = ch.status === 'ongoing' && (isFullCompletion || isPastEnd);");
    });

    it('중복 요청은 기존 60초 방지 장치가 막는다', () => {
        const sync = APP.split('function requestAssetChallengeProgressSync(')[1].split('\n}')[0];
        expect(sync).toContain('_assetChallengeProgressSyncKeys.has(syncKey)');
        expect(sync).toContain('60_000');
    });
});

// 이 요청이 서버 상태를 바꾸면 화면도 다시 그려져야 한다. 그 연결이 끊기면
// 증상이 그대로 돌아온다.
describe('재계산 결과가 화면에 도달한다', () => {
    it('진행도 갱신이 자산 화면을 다시 그린다', () => {
        const bm = readRepoFile('js/blockchain-manager.js');
        const fn = bm.split('export async function updateChallengeProgress(')[1].split('\n}')[0];
        expect(fn).toContain("refreshAssetDisplayAfterChallengeMutation('challenge-progress')");
    });
});
