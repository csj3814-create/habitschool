import { describe, expect, it } from 'vitest';
import { readAppSource, readRepoFile } from './source-helpers.js';

// 공유 카드가 내보내던 주소는 초대 코드가 없는 맨 주소였다(`${APP_ORIGIN}/#gallery`).
// 그래서 누가 공유해서 누가 들어왔는지 알 수 없었고, 공유한 사람에게 돌려줄 근거도
// 없었다. 초대 코드 처리 흐름 자체는 이미 있었으므로 링크에 코드를 싣기만 하면 된다.
describe('share link carries the inviter referral code', () => {
    it('appends the referral code ahead of the hash so auth.js can read it', () => {
        const appSource = readAppSource();

        expect(appSource).toContain('function getMyReferralCode()');
        // location.search에서 읽으므로 ?ref=는 반드시 #gallery 앞에 와야 한다.
        expect(appSource).toContain('return `${APP_ORIGIN}/?ref=${code}#gallery`;');
        // 코드를 못 구했다고 공유가 막히면 안 된다.
        expect(appSource).toContain('if (!/^[A-Z0-9]{6}$/.test(code)) return `${APP_ORIGIN}/#gallery`;');
    });

    it('publishes the referral code before the profile screen is rendered', () => {
        const authSource = readRepoFile('js/auth.js');

        // 공유 카드는 프로필 화면보다 먼저 만들어질 수 있다. DOM만 보면 코드를 놓친다.
        expect(authSource).toContain('window.__HABITSCHOOL_REFERRAL_CODE = referralCode;');
    });

    it('shows the invite notice only to signed-out visitors arriving from a share', () => {
        const authSource = readRepoFile('js/auth.js');
        const markup = readRepoFile('index.html');

        expect(markup).toContain('id="invite-landing-banner"');
        expect(authSource).toContain('banner.hidden = !(_arrivedViaInviteLink && !isSignedIn);');
        expect(authSource).toContain('applyInviteLandingBanner(false);');
        expect(authSource).toContain('applyInviteLandingBanner(true);');
        // 초대한 사람 이름은 싣지 않는다. 이름을 보여주려면 비로그인이 부를 수 있는
        // 공개 API가 필요한데, 6자리 코드를 훑어 남의 표시 이름을 긁을 수 있게 된다.
        expect(markup).not.toContain('invite-landing-inviter-name');
    });

    it('records how each share actually left the app', () => {
        const appSource = readAppSource();

        expect(appSource).toContain('function trackShareCardSent(');
        expect(appSource).toContain("trackShareCardSent('web_share_files');");
        expect(appSource).toContain("trackShareCardSent('web_share_files', 'cancelled');");
        expect(appSource).toContain("trackShareCardSent('clipboard', 'success', 'share_modal');");
        expect(appSource).toContain("trackShareCardSent('download', 'success', 'share_modal');");
    });
});
