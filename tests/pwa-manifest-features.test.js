import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(TEST_DIR, '..');

function readRepoFile(relativePath) {
    return readFileSync(resolve(ROOT_DIR, relativePath), 'utf8');
}

describe('PWA manifest features', () => {
    it('advertises shared image import, screenshots, and launch handling', () => {
        const manifest = JSON.parse(readRepoFile('manifest.json'));

        expect(manifest.share_target?.action).toBe('/share-target');
        expect(manifest.share_target?.params?.files?.[0]?.name).toBe('sharedImages');
        expect(manifest.launch_handler?.client_mode).toEqual(['focus-existing', 'auto']);
        expect(Array.isArray(manifest.screenshots)).toBe(true);
        expect(manifest.screenshots.length).toBeGreaterThanOrEqual(2);
        expect(manifest.screenshots.every((item) => String(item?.src || '').startsWith('icons/'))).toBe(true);
    });

    it('keeps the share target service worker flow generic', () => {
        const swSource = readRepoFile('sw.js');

        expect(swSource).toContain("const SHARE_TARGET_MANIFEST_URL = new URL('/__share_target__/shared/manifest.json'");
        expect(swSource).toContain("const LEGACY_SHARE_TARGET_MANIFEST_URL = new URL('/__share_target__/diet/manifest.json'");
        expect(swSource).toContain("['sharedImages', 'dietPhotos']");
        expect(swSource).toContain('./icons/feature-graphic.png');
        expect(swSource).toContain('./icons/feature-graphic-minimal.png');
    });
});
