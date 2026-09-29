import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';
import { shouldTryGoogleOneTap } from '../js/auth-login-helpers.js';

// 2026-09-27 제보: 삼성 인터넷에서 구글 계정을 고르는 순간 "연결 프로그램: Gmail /
// NAVER WORKS" 창이 떴다. accounts.google.com 으로 주소가 바뀌면 안드로이드가 그 주소를
// 처리하겠다는 앱에 넘길지 묻는다. 원탭은 페이지 안에서 고르므로 주소가 바뀌지 않는다.

const AUTH = readRepoFile('js/auth.js');
const FIREBASE = readRepoFile('firebase.json');

const SAMSUNG = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/30.0 Chrome/143.0.0.0 Mobile Safari/537.36';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

describe('who gets Google One Tap first', () => {
    it('Android browsers, including Samsung Internet where the chooser appeared', () => {
        expect(shouldTryGoogleOneTap({ userAgent: SAMSUNG })).toBe(true);
        expect(shouldTryGoogleOneTap({ userAgent: ANDROID_CHROME })).toBe(true);
    });

    it('not iPhone or desktop, where nothing hands the address to an app', () => {
        expect(shouldTryGoogleOneTap({ userAgent: IPHONE })).toBe(false);
        expect(shouldTryGoogleOneTap({ userAgent: DESKTOP })).toBe(false);
    });

    it('not the installed app or a forced login mode', () => {
        expect(shouldTryGoogleOneTap({ userAgent: SAMSUNG, isStandalone: true })).toBe(false);
        expect(shouldTryGoogleOneTap({ userAgent: SAMSUNG, overrideMode: 'redirect' })).toBe(false);
    });
});

describe('One Tap sign-in wiring', () => {
    it('signs in to Firebase with the Google credential, never by moving the page', () => {
        const fn = AUTH.slice(AUTH.indexOf('function tryGoogleOneTapSignIn'), AUTH.indexOf('let _getMyConsentsCallable'));
        expect(fn).toContain('GoogleAuthProvider.credential(response?.credential');
        expect(fn).toContain('signInWithCredential(auth, credential)');
        expect(fn).toContain('use_fedcm_for_prompt: true');
        expect(fn).not.toMatch(/signInWith(Redirect|Popup)\(/);
    });

    it('falls back to the old redirect only when One Tap could not show, not when the person closed it', () => {
        const click = AUTH.slice(AUTH.indexOf("loginBtn.addEventListener('click', async () => {"), AUTH.indexOf('function startFirebaseGoogleLogin'));
        expect(click).toContain('if (oneTap.cancelled) {');
        expect(click).toContain('startFirebaseGoogleLogin(loginBtn, { forceRedirect: true });');
        expect(click.indexOf('if (oneTap.cancelled) {')).toBeLessThan(click.indexOf('forceRedirect: true'));
    });

    it('uses redirect after waiting, because a popup would be blocked without the tap', () => {
        expect(AUTH).toContain("const loginMode = forceRedirect ? 'redirect' : getPreferredGoogleLoginMode();");
    });

    it('lets the One Tap script and styles through the content security policy', () => {
        expect(FIREBASE).toContain('https://accounts.google.com/gsi/client');
        expect(FIREBASE).toContain('https://accounts.google.com/gsi/style');
    });
});
