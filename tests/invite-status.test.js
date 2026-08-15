import { describe, expect, it } from 'vitest';
import { readAppSource, readFunctionsSource, readRepoFile } from './source-helpers.js';

// 초대 보상(친구 3일 달성 시 +500P)은 진작 지급되고 있었는데, 초대한 사람이 그걸
// 볼 방법이 없었다. 몇 명이 들어왔는지도, 500P가 왜 들어왔는지도 알 수 없어
// 보상이 있으나 마나였다.
describe('invite status for the person doing the inviting', () => {
    it('aggregates on the server because clients cannot read other user documents', () => {
        const functionsSource = readFunctionsSource();
        const rules = readRepoFile('firestore.rules');

        // 이 규칙이 있는 한 클라이언트가 직접 집계할 수 없다. 서버 집계가 필수다.
        expect(rules).toContain('allow read: if isOwner(userId) || isAdmin();');
        expect(functionsSource).toContain('exports.getMyInviteStatus = onCall(');
        expect(functionsSource).toContain('.where("referredBy", "==", uid)');
        // 스캔 범위를 묶지 않으면 초대가 많은 계정에서 읽기가 무한정 늘어난다.
        expect(functionsSource).toContain('const INVITE_STATUS_SCAN_LIMIT = 500;');
        expect(functionsSource).toContain('.limit(INVITE_STATUS_SCAN_LIMIT)');
    });

    it('reports points from the ledger instead of multiplying head count', () => {
        const functionsSource = readFunctionsSource();
        const statusFn = functionsSource
            .split('exports.getMyInviteStatus = onCall(')[1]
            ?.split('exports.acceptInviteLinkFriendship')[0] || '';

        expect(statusFn).not.toBe('');
        // 인원수 × 500으로 추정하면 이월/예외 지급과 어긋난다. 원장이 진실이다.
        expect(statusFn).toContain('.where("category", "==", "referral_day3")');
        expect(statusFn).not.toContain('milestoneCount * 500');

        // credited로 거르지 않는다. 그 표식은 이중지급을 막으려고 붙인 것이고
        // 지급 여부는 checkReferralMilestone이 ledgerSnap.exists로 막는다.
        // 원장 도입 전 지급분은 credited:false로 백필돼 있는데(옛 코드가 coins를
        // 실제로 올리고 나간 돈이다), 그걸 빼면 이미 받은 사람에게 0P가 보인다.
        expect(statusFn).toContain('earnedPoints += Number(entry.points || 0);');
        expect(statusFn).not.toContain('if (entry.credited === true)');
        // 이름이나 uid는 돌려주지 않는다. 화면에 필요한 건 숫자뿐이다.
        expect(statusFn).not.toContain('displayName');
        expect(statusFn).not.toContain('email');
    });

    it('hides the panel instead of showing three zeros to someone with no invites', () => {
        const appSource = readAppSource();
        const markup = readRepoFile('index.html');
        const renderFn = appSource
            .split('function renderInviteStatus(')[1]
            ?.split('async function refreshInviteStatus(')[0] || '';

        expect(markup).toContain('id="profile-invite-status"');
        expect(renderFn).not.toBe('');
        // 0을 세 개 늘어놓으면 실패한 화면처럼 읽힌다.
        expect(renderFn).toContain('if (invited === 0) {');
        // 프로필 화면 진입을 막지 않도록 시간 제한을 둔다.
        expect(appSource).toContain("'invite_status_timeout'");
        expect(appSource).toContain('refreshInviteStatus().catch(error => {');
    });

    it('tells the sharer what the share is actually worth', () => {
        const markup = readRepoFile('index.html');

        // 공유를 권하는 자리에서 금액을 말하지 않으면 보상이 있는지도 모른다.
        expect(markup).toContain('친구가 들어와 3일 기록하면 나에게 500P가 들어와요');
        expect(markup).toContain('<strong>200P</strong>');
    });
});
