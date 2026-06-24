import { describe, expect, it } from 'vitest';
import {
    buildAppModeUrl,
    buildLocalizedUrl,
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

    it('treats /en as the English simple entry with Food as the default tab', () => {
        const context = getRouteContext('/en');
        expect(context).toMatchObject({
            locale: 'en',
            mode: 'simple',
            isEnglish: true,
            isSimple: true,
            defaultTab: 'diet',
            basePath: '/en'
        });
        expect(getLocale('/en/index.html')).toBe('en');
        expect(getAppModeFromPath('/en/')).toBe('simple');
        expect(getDefaultTabForMode('simple', 'en')).toBe('diet');
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
