import { describe, expect, it } from 'vitest';
import { getAppModeFromPath, getDefaultTabForMode, normalizeAppPath, normalizeTabForMode } from '../js/app-mode.js';

describe('app-mode helpers', () => {
    it('treats /simple as the simple app mode path', () => {
        expect(getAppModeFromPath('/simple')).toBe('simple');
        expect(getAppModeFromPath('/simple/')).toBe('simple');
        expect(getAppModeFromPath('/')).toBe('default');
    });

    it('keeps the simple-mode tabs plus the profile shortcut tab', () => {
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
});
