import { describe, expect, it } from 'vitest';

import {
    createPendingGoogleLoginState,
    parsePendingGoogleLoginState,
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
