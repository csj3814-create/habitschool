import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 2026-10-01: 9월 초대 링크 방문자 70명 중 로그인을 누른 사람은 10명(14%).
// 카톡 미리보기에는 초대한 사람 이름이 있었는데, 들어오면 "친구가 초대했어요" 뿐이었다.

const RUNTIME = readRepoFile('functions/runtime.js');
const AUTH = readRepoFile('js/auth.js');
const INDEX = readRepoFile('index.html');
const FN = RUNTIME.split('exports.getInviteLandingInfo = onCall(')[1].split('\n);')[0];

describe('invite landing names who invited you', () => {
    it('looks up only by a valid invite code and returns just a name and a day count', () => {
        expect(FN).toContain('if (!INVITE_CODE_PATTERN.test(code)) return { found: false };');
        expect(FN).toContain('.where("referralCode", "==", code).limit(1)');
        expect(FN).toContain('recordDays: recordDays >= 3 ? recordDays : 0');
        expect(FN).not.toContain('email');
    });

    it('fills the banner for signed-out visitors who came by invite link', () => {
        const apply = AUTH.split('function applyInviteLandingBanner(isSignedIn) {')[1].split('\n}\n')[0];
        expect(apply).toContain('showInviterOnLanding();');
        const show = AUTH.split('async function showInviterOnLanding() {')[1].split('\n}\n')[0];
        expect(show).toContain("httpsCallable(functions, 'getInviteLandingInfo')");
        expect(show).toContain('님이 초대했어요');
        expect(show).toContain('if (!info.found || !name) return;');
    });

    it('says what you get before asking you to sign in', () => {
        expect(INDEX).toContain('data-i18n="invite.point1"');
        expect(INDEX).toContain('data-i18n="invite.point2"');
        expect(INDEX).toContain('data-i18n="invite.point3"');
        expect(INDEX).toContain('id="invite-landing-inviter"');
    });
});

describe('first screen for everyone says what you get', () => {
    it('lists three points above the sign-in button and folds them when the invite banner says the same', () => {
        expect(INDEX).toContain('id="login-value-points"');
        expect(INDEX.indexOf('id="login-value-points"')).toBeLessThan(INDEX.indexOf('id="loginBtn"'));
        expect(INDEX).toContain('🎁 지금 시작하면 가입 선물 200P');
        const apply = AUTH.split('function applyInviteLandingBanner(isSignedIn) {')[1].split('\n}\n')[0];
        expect(apply).toContain('if (valuePoints) valuePoints.hidden = shouldShow;');
    });
});

describe('the start box is one button', () => {
    it('holds the points and the Google button in one box', () => {
        const box = INDEX.split('<div class="login-start-card" id="login-start-card">')[1];
        expect(box).toBeTruthy();
        const loginAt = box.indexOf('id="loginBtn"');
        expect(box.indexOf('id="login-value-points"')).toBeLessThan(loginAt);
        expect(box.indexOf('id="invite-landing-banner"')).toBeLessThan(loginAt);
    });

    it('starts sign-in from anywhere in the box, leaving the button and links alone', () => {
        const init = AUTH.split('export function initAuth() {')[1];
        expect(init).toContain("document.getElementById('login-start-card')");
        expect(init).toContain("if (event.target.closest('#loginBtn, a, button, input, label')) return;");
        expect(init).toContain('loginBtn.click();');
    });
});
