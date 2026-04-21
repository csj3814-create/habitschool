import { describe, expect, it } from 'vitest';

import {
    createPendingGoogleLoginState,
    createPendingSignupOnboardingState,
    isNewUserCredential,
    parsePendingGoogleLoginState,
    parsePendingSignupOnboardingState,
    shouldAutoGrantWelcomeBonus,
    shouldShowSignupOnboarding,
    shouldUseGoogleRedirectLogin
} from '../js/auth-login-helpers.js';

describe('shouldUseGoogleRedirectLogin', () => {
    it('uses redirect for Samsung Internet', () => {
        const samsungUa = 'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/125.0.0.0 Mobile Safari/537.36';
        expect(shouldUseGoogleRedirectLogin(samsungUa)).toBe(true);
    });

    it('keeps popup flow for Chrome', () => {
        const chromeUa = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36';
        expect(shouldUseGoogleRedirectLogin(chromeUa)).toBe(false);
    });
});

describe('pending google login state helpers', () => {
    it('creates and parses a redirect pending state', () => {
        const created = createPendingGoogleLoginState('redirect', 12345);
        expect(parsePendingGoogleLoginState(JSON.stringify(created), 12345 + 1000)).toEqual({
            mode: 'redirect',
            createdAt: 12345
        });
    });

    it('drops stale pending states', () => {
        const created = createPendingGoogleLoginState('popup', 1000);
        expect(parsePendingGoogleLoginState(JSON.stringify(created), 1000 + (10 * 60 * 1000) + 1)).toBeNull();
    });
});

describe('pending signup onboarding helpers', () => {
    it('creates and parses a pending signup onboarding state', () => {
        const created = createPendingSignupOnboardingState('user-1', 5000);
        expect(parsePendingSignupOnboardingState(JSON.stringify(created), 5000 + 1000)).toEqual({
            uid: 'user-1',
            createdAt: 5000
        });
    });

    it('drops stale pending signup onboarding states', () => {
        const created = createPendingSignupOnboardingState('user-1', 1000);
        expect(parsePendingSignupOnboardingState(JSON.stringify(created), 1000 + (30 * 60 * 1000) + 1)).toBeNull();
    });
});

describe('isNewUserCredential', () => {
    it('detects new users from token responses', () => {
        expect(isNewUserCredential({ _tokenResponse: { isNewUser: true } })).toBe(true);
        expect(isNewUserCredential({ _tokenResponse: { isNewUser: false } })).toBe(false);
    });

    it('prefers explicit additionalUserInfo when present', () => {
        expect(isNewUserCredential({ additionalUserInfo: { isNewUser: true }, _tokenResponse: { isNewUser: false } })).toBe(true);
    });
});

describe('welcome bonus onboarding decisions', () => {
    it('shows onboarding for recent post-launch signups even if the pending marker is missing', () => {
        expect(shouldShowSignupOnboarding({
            userId: 'u1',
            userData: { createdAt: '2026-04-20T00:00:00.000Z', onboardingComplete: false, welcomeBonusGiven: false },
            pendingState: null,
            now: Date.parse('2026-04-20T00:10:00.000Z')
        })).toBe(true);
    });

    it('does not show onboarding for legacy users without a pending marker', () => {
        expect(shouldShowSignupOnboarding({
            userId: 'u1',
            userData: { createdAt: '2026-03-20T00:00:00.000Z', onboardingComplete: false, welcomeBonusGiven: false },
            pendingState: null,
            now: Date.parse('2026-04-20T00:10:00.000Z')
        })).toBe(false);
    });

    it('marks missed recent welcome bonuses as recoverable after onboarding completion', () => {
        expect(shouldAutoGrantWelcomeBonus({
            createdAt: '2026-04-20T00:00:00.000Z',
            onboardingComplete: true,
            welcomeBonusGiven: false
        })).toBe(true);

        expect(shouldAutoGrantWelcomeBonus({
            createdAt: '2026-03-20T00:00:00.000Z',
            onboardingComplete: true,
            welcomeBonusGiven: false
        })).toBe(false);
    });
});
