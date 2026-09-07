import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

import {
    createPendingGoogleLoginState,
    createPendingSignupOnboardingState,
    getPendingGoogleRedirectRecoveryRemainingMs,
    hasChosenPrimaryHabit,
    hasStartedRecording,
    isNewUserCredential,
    normalizeGoogleLoginMode,
    parsePendingGoogleLoginState,
    parsePendingSignupOnboardingState,
    resolveGoogleLoginMode,
    resolvePendingGoogleLoginState,
    shouldAutoGrantWelcomeBonus,
    shouldKeepPendingGoogleRedirectRecovery,
    shouldShowSignupOnboarding,
    shouldUseGoogleRedirectLogin
} from '../js/auth-login-helpers.js';

const AUTH_SOURCE = readRepoFile('js/auth.js');
const APP_CORE_SOURCE = readRepoFile('js/app-core.js');
const INDEX_SOURCE = readRepoFile('index.html');

describe('shouldUseGoogleRedirectLogin', () => {
    // 2026-09-07: 일반 탭을 팝업으로 두면 안드로이드가 구글 계정 화면을 Gmail 앱에
    // 넘겨 사용자가 메일함에 떨어진다(실기기 재현). 그 튕김 때문에 4/27 에 좁혀
    // 뒀던 조건은 8/12 authDomain 수정으로 근거가 사라졌다. 함께 넓힌다.
    it('uses redirect for Samsung Internet in normal browser tabs too', () => {
        const samsungUa = 'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/125.0.0.0 Mobile Safari/537.36';
        expect(shouldUseGoogleRedirectLogin({ userAgent: samsungUa, isStandalone: false })).toBe(true);
    });

    it('uses redirect for Samsung Internet in standalone mode', () => {
        const samsungUa = 'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/125.0.0.0 Mobile Safari/537.36';
        expect(shouldUseGoogleRedirectLogin({ userAgent: samsungUa, isStandalone: true })).toBe(true);
    });

    // 2026-09-07 GA: 웨일 모바일 124명이 게스트 데모까지 쓰고(가입 클릭 19건)
    // record_saved 는 0건이었다. 삼성과 같은 처방을 쓴다.
    it('uses redirect for Whale on Android', () => {
        const whaleAndroid = 'Mozilla/5.0 (Linux; Android 14; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Whale/1.0.0.0 Mobile Safari/537.36';
        expect(shouldUseGoogleRedirectLogin({ userAgent: whaleAndroid, isStandalone: false })).toBe(true);
    });

    it('leaves desktop Whale on popup — the intent hijack is an Android behaviour', () => {
        const whaleDesktop = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Whale/4.0.0.0 Safari/537.36';
        expect(shouldUseGoogleRedirectLogin({ userAgent: whaleDesktop, isStandalone: false })).toBe(false);
    });

    it('keeps popup flow for Chrome', () => {
        const chromeUa = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36';
        expect(shouldUseGoogleRedirectLogin({ userAgent: chromeUa, isStandalone: false })).toBe(false);
    });
});

describe('resolveGoogleLoginMode', () => {
    it('ignores a stale popup override for Samsung Internet', () => {
        // 예전에 팝업으로 실패해 남은 override 가 삼성 인터넷을 다시 팝업으로
        // 끌고 가면 안 된다. 그 경로가 곧 Gmail 로 새는 경로다.
        const samsungUa = 'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/125.0.0.0 Mobile Safari/537.36';
        expect(resolveGoogleLoginMode({
            userAgent: samsungUa,
            isStandalone: false,
            overrideMode: 'popup'
        })).toBe('redirect');
    });

    it('ignores popup overrides only for Samsung Internet standalone mode', () => {
        const samsungUa = 'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/125.0.0.0 Mobile Safari/537.36';
        expect(resolveGoogleLoginMode({
            userAgent: samsungUa,
            isStandalone: true,
            overrideMode: 'popup'
        })).toBe('redirect');
    });

    it('honors a popup override on regular Chrome', () => {
        const chromeUa = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36';
        expect(resolveGoogleLoginMode({
            userAgent: chromeUa,
            isStandalone: true,
            overrideMode: 'popup'
        })).toBe('popup');
    });

    it('normalizes invalid mode overrides away', () => {
        expect(normalizeGoogleLoginMode('weird')).toBe('');
        expect(normalizeGoogleLoginMode('popup')).toBe('popup');
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

    it('keeps recent redirect recovery windows only for redirect mode', () => {
        const redirectState = createPendingGoogleLoginState('redirect', 5000);
        const popupState = createPendingGoogleLoginState('popup', 5000);

        expect(shouldKeepPendingGoogleRedirectRecovery(redirectState, 5000 + 3000)).toBe(true);
        expect(shouldKeepPendingGoogleRedirectRecovery(redirectState, 5000 + 10000)).toBe(true);
        expect(shouldKeepPendingGoogleRedirectRecovery(redirectState, 5000 + 21000)).toBe(false);
        expect(shouldKeepPendingGoogleRedirectRecovery(popupState, 5000 + 3000)).toBe(false);
    });

    it('prefers a valid persistent redirect marker when session storage is lost', () => {
        const persistentState = JSON.stringify(createPendingGoogleLoginState('redirect', 5000));
        expect(resolvePendingGoogleLoginState({
            sessionValue: null,
            persistentValue: persistentState,
            now: 5000 + 1000
        })).toEqual({
            state: { mode: 'redirect', createdAt: 5000 },
            source: 'persistent'
        });
    });

    it('reports remaining redirect recovery time', () => {
        const redirectState = createPendingGoogleLoginState('redirect', 5000);
        expect(getPendingGoogleRedirectRecoveryRemainingMs(redirectState, 5000 + 3000)).toBe(17000);
        expect(getPendingGoogleRedirectRecoveryRemainingMs(redirectState, 5000 + 22000)).toBe(0);
    });
});

describe('auth shell recovery guards', () => {
    it('defers the logged-out shell while camera or file picker recovery is active', () => {
        expect(AUTH_SOURCE).toContain('function shouldDeferLoggedOutShellForMediaPicker()');
        expect(AUTH_SOURCE).toContain("const MEDIA_PICKER_RECOVERY_STORAGE_KEY = 'habitschool-media-picker-recovery-v1';");
        expect(AUTH_SOURCE).toContain('function getStoredMediaPickerAuthRecoveryRemainingMs');
        expect(AUTH_SOURCE).toContain('return Math.max(0, appCoreRemaining, storageRemaining);');
        expect(AUTH_SOURCE).toContain('function setMediaPickerAuthRecoveryClass(isActive)');
        expect(AUTH_SOURCE).toContain('window.getHabitschoolMediaPickerRecoveryRemainingMs');
        expect(AUTH_SOURCE).toContain('function applyMediaPickerAuthRecoveryShellUi(loginBtn)');
        expect(AUTH_SOURCE).toContain("document.documentElement.classList.toggle('media-picker-auth-recovery', !!isActive);");
        expect(AUTH_SOURCE).toContain("if (loginModal) loginModal.style.display = 'none';");
        expect(AUTH_SOURCE).toContain('if (shouldDeferLoggedOutShellForMediaPicker())');
        expect(AUTH_SOURCE).toContain('window._isPopupLogin = true;');
        expect(AUTH_SOURCE).toContain('scheduleMediaPickerSignedOutRecovery(callbacks);');
        expect(AUTH_SOURCE).toContain('if (shouldDeferLoggedOutShellForMediaPicker())');
        expect(AUTH_SOURCE).toContain('applyMediaPickerAuthRecoveryShellUi(loginBtn);');
        expect(AUTH_SOURCE).toContain('handleSignedOutAuthState(callbacks);');
        expect(APP_CORE_SOURCE).toContain("document.documentElement.classList.add('media-picker-auth-recovery');");
        expect(APP_CORE_SOURCE).toContain('const handleFocus = () => window.setTimeout(schedulePickerFallbackCleanup, 0);');
        expect(APP_CORE_SOURCE).not.toContain('const handleFocus = () => window.setTimeout(finishPickerReturn, 0);');
        expect(INDEX_SOURCE).toContain("var key = 'habitschool-media-picker-recovery-v1';");
        expect(INDEX_SOURCE).toContain('html.media-picker-auth-recovery #login-modal');
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

    // 2026-09-07: 게이트가 휘발성 표식에 걸려 있어 608명 중 390명이 모달을
    // 못 본 채 완료로 찍혔다. 아래 네 건이 그 회귀를 막는다.
    it('still shows onboarding once the welcome bonus was granted but no habit was ever chosen', () => {
        // 예전에는 welcomeBonusGiven 하나로 영구히 닫혔다. 기록이 0인 431명 중
        // 311명이 정확히 이 상태였다.
        expect(shouldShowSignupOnboarding({
            userId: 'u1',
            userData: {
                createdAt: '2026-04-20T00:00:00.000Z',
                onboardingComplete: true,
                welcomeBonusGiven: true
            },
            pendingState: null,
            now: Date.parse('2026-06-01T00:00:00.000Z')
        })).toBe(true);
    });

    it('shows onboarding long after signup — the 30 minute window no longer closes the gate', () => {
        expect(shouldShowSignupOnboarding({
            userId: 'u1',
            userData: { createdAt: '2026-04-20T00:00:00.000Z' },
            pendingState: null,
            now: Date.parse('2026-04-20T09:00:00.000Z')
        })).toBe(true);
    });

    it('does not show onboarding once a habit was actually chosen', () => {
        expect(shouldShowSignupOnboarding({
            userId: 'u1',
            userData: {
                createdAt: '2026-04-20T00:00:00.000Z',
                settings: { primaryHabit: 'diet' }
            },
            pendingState: { uid: 'u1' }
        })).toBe(false);
    });

    it('does not interrupt a member who already records — the modal has no close button', () => {
        expect(shouldShowSignupOnboarding({
            userId: 'u1',
            userData: { createdAt: '2026-04-20T00:00:00.000Z', lastLogDate: '2026-08-30' }
        })).toBe(false);
        // lastLogDate 백필(2026-09-01) 이전 회원은 currentStreak 로도 걸러진다.
        expect(shouldShowSignupOnboarding({
            userId: 'u1',
            userData: { createdAt: '2026-04-20T00:00:00.000Z', currentStreak: 4 }
        })).toBe(false);
    });

    it('reads the habit from settings.primaryHabit, not onboardingComplete', () => {
        // onboardingComplete 는 모달을 못 본 사람에게도 자동으로 찍힌다.
        expect(hasChosenPrimaryHabit({ onboardingComplete: true })).toBe(false);
        expect(hasChosenPrimaryHabit({ settings: { primaryHabit: 'exercise' } })).toBe(true);
        expect(hasChosenPrimaryHabit({ settings: { primaryHabit: '  ' } })).toBe(false);
    });

    it('treats either lastLogDate or a positive streak as having started', () => {
        expect(hasStartedRecording({})).toBe(false);
        expect(hasStartedRecording({ currentStreak: 0 })).toBe(false);
        expect(hasStartedRecording({ lastLogDate: '2026-09-01' })).toBe(true);
        expect(hasStartedRecording({ currentStreak: 1 })).toBe(true);
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
