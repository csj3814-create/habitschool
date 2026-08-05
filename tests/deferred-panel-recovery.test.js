import { describe, expect, it } from 'vitest';
import { readAppSource } from './source-helpers.js';

// 증상: 소모임·해빛마켓·쿠폰이 바로 안 뜨고, 한참 있다가 뜨거나 다른 탭에 나갔다
// 와야 떴다. 두 패널이 서로 다른 이유로 같은 증상을 냈다.
describe('panels recover on their own instead of waiting for the user', () => {
    // 소모임은 조회가 늦으면 catch로 떨어져 '다시 확인 중' 화면을 그렸는데,
    // 그 뒤로 아무것도 다시 시도하지 않았다. 버튼을 누르거나 탭을 나갔다 와야 했다.
    it('retries the habit-group card by itself', () => {
        const appSource = readAppSource();

        expect(appSource).toContain('function scheduleSocialRetry(');
        expect(appSource).toContain("scheduleSocialRetry(auth.currentUser?.uid || '', 'habit_groups_render_deferred')");
        // 자산 탭과 같은 간격·횟수를 쓴다. 화면마다 다른 리듬을 두면 예측이 안 된다.
        expect(appSource).toContain('const SOCIAL_RETRY_DELAY_MS = 2000;');
        expect(appSource).toContain('const SOCIAL_MAX_RETRY_ATTEMPTS = 3;');
        // 신호가 여러 번 와도 재시도는 하나만 예약한다.
        expect(appSource).toContain('if (_socialRetryTimer) return true;');
        // 캐시가 비어 실패한 것이므로 캐시를 지우고 다시 읽어야 한다.
        expect(appSource).toContain('_habitGroupMembershipCache = { uid: \'\', loadedAt: 0, memberships: [] };');
    });

    it('gives the retry budget back once the card renders', () => {
        const appSource = readAppSource();

        // 성공했는데도 카운터가 남아 있으면, 세션 중 3회를 소진한 뒤로는 자동
        // 재시도가 영영 안 걸린다.
        expect(appSource).toContain('function clearSocialRetry(');
        expect(appSource).toContain("clearSocialRetry(auth.currentUser?.uid || '');");
        // 손으로 누른 재시도도 예산을 되돌린다.
        const manualRetry = appSource
            .split('window.retrySocialChallengesCard = function() {')[1]
            ?.split('\n};')[0] || '';
        expect(manualRetry).toContain('clearSocialRetry(user.uid);');
    });

    // 마켓·쿠폰은 이유가 달랐다. loadRewardMarketSnapshot 호출이 '사용자 문서 로드
    // 성공' 분기 안에만 있어서, 문서가 늦으면 조회가 시작조차 되지 않았고
    // index.html의 '불러오는 중' 문구가 그대로 남았다.
    it('loads the market even when the user document is late', () => {
        const appSource = readAppSource();
        const calls = appSource.split('loadRewardMarketSnapshot(').length - 1;

        // 캐시 히트 / 정상 / 지연 / 예외 — 네 갈래 모두에서 불러야 한다.
        expect(calls).toBeGreaterThanOrEqual(4);
        expect(appSource).toContain("console.warn('reward market deferred-branch load skipped:'");
        expect(appSource).toContain('loadRewardMarketSnapshot(false).catch(() => {});');
    });
});
