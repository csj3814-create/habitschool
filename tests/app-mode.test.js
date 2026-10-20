import { describe, expect, it } from 'vitest';
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
    // 아직 번역하지 않은 탭(대시보드·갤러리·자산)은 ENGLISH_TABS 에 없어 열리지 않는다.
    it('treats /en as the full English app that starts on Food while only translated tabs are open', () => {
        const context = getRouteContext('/en');
        expect(context).toMatchObject({
            locale: 'en',
            mode: 'default',
            isEnglish: true,
            isSimple: false,
            defaultTab: 'diet',
            basePath: '/en'
        });
        expect(getLocale('/en/index.html')).toBe('en');
        expect(getAppModeFromPath('/en/')).toBe('default');
        expect(getDefaultTabForMode('default', 'en')).toBe('diet');
        expect(getAllowedTabsForRoute(context)).toEqual(['diet', 'exercise', 'sleep', 'profile']);
        expect(normalizeTabForRoute('dashboard', context)).toBe('diet');
        expect(normalizeTabForRoute('exercise', context)).toBe('exercise');
    });

    it('builds localized canonical app urls', () => {
        const originalWindow = global.window;
        global.window = { location: { origin: 'https://habitschool.web.app', pathname: '/en' } };

        try {
            expect(buildLocalizedUrl('en')).toBe('https://habitschool.web.app/en');
            expect(buildLocalizedUrl('en', 'exercise')).toBe('https://habitschool.web.app/en#exercise');
            expect(buildLocalizedUrl('en', 'diet', { focus: 'upload' })).toBe('https://habitschool.web.app/en?focus=upload');
            expect(buildLocalizedUrl('ko', 'diet')).toBe('https://habitschool.web.app/#diet');
            expect(buildAppModeUrl('simple')).toBe('https://habitschool.web.app/simple');
        } finally {
            global.window = originalWindow;
        }
    });
});
