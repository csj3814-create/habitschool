import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    buildAppModeUrl,
    buildLocalizedUrl,
    getAllowedTabsForRoute,
    getAppModeFromPath,
    getDefaultTabForMode,
    getLocale,
    getRouteContext,
    normalizeAppPath,
    normalizeTabForMode,
    normalizeTabForRoute
} from '../js/app-mode.js';

describe('app-mode helpers', () => {
    it('treats /simple as the simple app mode path', () => {
        expect(getAppModeFromPath('/simple')).toBe('simple');
        expect(getAppModeFromPath('/simple/')).toBe('simple');
        expect(getAppModeFromPath('/')).toBe('default');
    });

    it('keeps the simple-mode tabs plus the profile shortcut tab', () => {
        expect(getDefaultTabForMode('simple')).toBe('profile');
        expect(normalizeTabForMode('diet', 'simple')).toBe('diet');
        expect(normalizeTabForMode('exercise', 'simple')).toBe('exercise');
        expect(normalizeTabForMode('sleep', 'simple')).toBe('sleep');
        expect(normalizeTabForMode('profile', 'simple')).toBe('profile');
        expect(normalizeTabForMode('dashboard', 'simple')).toBe(getDefaultTabForMode('simple'));
        expect(normalizeTabForMode('gallery', 'simple')).toBe(getDefaultTabForMode('simple'));
    });

    it('normalizes trailing slashes without breaking the root path', () => {
        expect(normalizeAppPath('/simple/')).toBe('/simple');
        expect(normalizeAppPath('/en/')).toBe('/en');
        expect(normalizeAppPath('/')).toBe('/');
        expect(normalizeAppPath('')).toBe('/');
    });

    // 2026-11-11: 심플형을 기본 앱으로 합쳤다. 초대 QR 은 /simple?ref=코드 가 아니라 /?ref=코드 를 연다.
    it('초대 QR 은 기본 앱 주소(/?ref=코드)를 만든다', () => {
        const originalWindow = global.window;
        global.window = { location: { origin: 'https://habitschool.web.app' } };
        try {
            expect(buildAppModeUrl('default', '', { ref: 'ABC123' })).toBe('https://habitschool.web.app/?ref=ABC123');
        } finally {
            global.window = originalWindow;
        }
        const appCore = readFileSync(new URL('../js/app-core.js', import.meta.url), 'utf8');
        const qrBuilder = appCore.slice(appCore.indexOf('function buildSimpleModeReferralQrUrl'), appCore.indexOf('function readSimpleProfilePointFallback'));
        expect(qrBuilder).toContain("buildAppModeUrl('default', '', searchParams)");
        expect(qrBuilder).not.toContain("buildAppModeUrl('simple'");
    });

    it('builds a simple-mode url without forcing a hash for the default tab', () => {
        const originalWindow = global.window;
        global.window = { location: { origin: 'https://habitschool.web.app' } };

        try {
            expect(buildAppModeUrl('simple')).toBe('https://habitschool.web.app/simple');
            expect(buildAppModeUrl('simple', '', { ref: 'ABC123' })).toBe('https://habitschool.web.app/simple?ref=ABC123');
        } finally {
            global.window = originalWindow;
        }
    });

    // 2026-10-21(해외 3단계 E2): 영어 앱은 심플형이 아니라 /app 과 같은 전체(default) 앱이다.
    // 탭은 번역해 여는 대로 ENGLISH_TABS 에 는다. 자산(E3)·대시보드(E4)·갤러리(E5-1)까지 열려 한국어 앱 탭과 같다.
    it('treats /en as the full English app that starts on the dashboard while only translated tabs are open', () => {
        const context = getRouteContext('/en');
        expect(context).toMatchObject({
            locale: 'en',
            mode: 'default',
            isEnglish: true,
            isSimple: false,
            defaultTab: 'dashboard',
            basePath: '/en'
        });
        expect(getLocale('/en/index.html')).toBe('en');
        expect(getAppModeFromPath('/en/')).toBe('default');
        expect(getDefaultTabForMode('default', 'en')).toBe('dashboard');
        expect(getAllowedTabsForRoute(context)).toEqual(['dashboard', 'diet', 'exercise', 'sleep', 'profile', 'gallery', 'assets']);
        expect(normalizeTabForRoute('gallery', context)).toBe('gallery');
        expect(normalizeTabForRoute('nope', context)).toBe('dashboard');
        expect(normalizeTabForRoute('exercise', context)).toBe('exercise');
    });

    it('builds localized canonical app urls', () => {
        const originalWindow = global.window;
        global.window = { location: { origin: 'https://habitschool.web.app', pathname: '/en' } };

        try {
            expect(buildLocalizedUrl('en')).toBe('https://habitschool.web.app/en');
            expect(buildLocalizedUrl('en', 'exercise')).toBe('https://habitschool.web.app/en#exercise');
            // 영어 앱 첫 탭이 대시보드가 된 뒤(E4-1)로는 식단 탭도 해시로 적는다.
            expect(buildLocalizedUrl('en', 'diet', { focus: 'upload' })).toBe('https://habitschool.web.app/en?focus=upload#diet');
            expect(buildLocalizedUrl('en', 'dashboard')).toBe('https://habitschool.web.app/en');
            expect(buildLocalizedUrl('ko', 'diet')).toBe('https://habitschool.web.app/#diet');
            expect(buildAppModeUrl('simple')).toBe('https://habitschool.web.app/simple');
        } finally {
            global.window = originalWindow;
        }
    });
});
