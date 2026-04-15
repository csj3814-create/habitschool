import { describe, expect, it } from 'vitest';
import { buildAppModeUrl, getAppModeFromPath, getDefaultTabForMode, normalizeAppPath, normalizeTabForMode } from '../js/app-mode.js';

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
});
