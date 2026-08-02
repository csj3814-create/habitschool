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

    // 안드로이드 공유 시트는 이미지와 텍스트를 함께 넘겨도 텍스트를 버리는 경우가
    // 많아 카톡에는 사진만 도착한다. 그래서 링크를 이미지 안에 QR로 굽는다.
    it('burns the entry link into the card so an image-only share still carries it', () => {
        const appSource = readAppSource();

        expect(appSource).toContain('async function drawSharePosterEntryFooter(');
        expect(appSource).toContain('const qrCanvas = await createShareQrCanvas(getShareTargetUrl(), SHARE_QR_DRAW_SIZE);');
        // QR을 만든 크기와 그리는 크기가 다르면 모듈 경계가 소수점에 걸려
        // 두께가 들쭉날쭉해지고 스캔이 실패한다. 같은 상수를 써야 한다.
        expect(appSource).toContain('const SHARE_QR_DRAW_SIZE = 128;');
        expect(appSource).toContain('ctx.drawImage(qrCanvas, 52 + QR_PAD, FOOTER_TOP + QR_PAD, SHARE_QR_DRAW_SIZE, SHARE_QR_DRAW_SIZE);');
        // 보간이 켜져 있으면 모듈 경계가 번진다.
        expect(appSource).toContain('ctx.imageSmoothingEnabled = false;');
        // QR을 못 만들어도 카드는 나가야 하고, 주소는 글자로라도 남아야 한다.
        expect(appSource).toContain("ctx.fillText(qrCanvas ? 'QR을 찍으면 바로 참여할 수 있어요' : '아래 주소로 참여하세요', textX, FOOTER_TOP + 40);");
        // 사진 타일이 푸터를 덮지 않도록 높이를 줄여 뒀다.
        expect(appSource).toContain("{ x: 52, y: 234, w: 976, h: 654 }");
        // 초대 코드가 늦게 채워지면 캐시된 카드가 코드 없는 QR을 물고 있게 된다.
        // 공유 주소를 렌더 키에 넣어 코드가 붙은 뒤 다시 굽게 한다.
        const renderKeyBody = appSource.split('function buildShareRenderKey(')[1]?.split('\n}')[0] || '';
        expect(renderKeyBody).toContain('getShareTargetUrl()');
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
