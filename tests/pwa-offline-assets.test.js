import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(TEST_DIR, '..');

function readRepoFile(relativePath) {
    return readFileSync(resolve(ROOT_DIR, relativePath), 'utf8');
}

function getStaticAssets() {
    const swSource = readRepoFile('sw.js');
    const listSource = swSource.match(/const STATIC_ASSETS = \[([\s\S]*?)\n\];/)?.[1] || '';
    return [...listSource.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

function withoutVersion(assetUrl) {
    return assetUrl.split('?')[0];
}

describe('PWA offline asset closure', () => {
    it('pre-caches only local assets that exist in the hosting tree', () => {
        const missing = getStaticAssets()
            .map(withoutVersion)
            .map((assetUrl) => assetUrl.replace(/^\.\//, ''))
            .filter((relativePath) => !existsSync(resolve(ROOT_DIR, relativePath)));

        expect(missing).toEqual([]);
    });

    it('pre-caches every static local dependency imported by cached JavaScript modules', () => {
        const staticAssets = getStaticAssets();
        const unversionedAssets = new Set(staticAssets.map(withoutVersion));
        const missingImports = [];

        for (const assetUrl of staticAssets.filter((url) => /^\.\/js\/[^?]+\.js(?:\?|$)/.test(url))) {
            const relativePath = withoutVersion(assetUrl).replace(/^\.\//, '');
            const moduleSource = readRepoFile(relativePath);
            const localImports = [
                ...moduleSource.matchAll(/(?:from\s+|import\s*)['"]\.\/([^'"]+\.js)(?:\?v=\d+)?['"]/g)
            ];

            for (const match of localImports) {
                const dependencyUrl = `./js/${match[1]}`;
                if (!unversionedAssets.has(dependencyUrl)) {
                    missingImports.push(`${assetUrl} -> ${dependencyUrl}`);
                }
            }
        }

        expect(missingImports).toEqual([]);
    });

    it('keeps cached Korean and English entry pages on the active release version', () => {
        const releaseVersion = readRepoFile('sw.js').match(/habitschool-v(\d+)/)?.[1];

        for (const relativePath of ['index.html', 'en/index.html']) {
            const html = readRepoFile(relativePath);
            const referencedVersions = [...html.matchAll(/["'](?:[^"']+)\?v=(\d+)["']/g)]
                .map((match) => match[1]);

            expect(referencedVersions.length, `${relativePath} should reference versioned assets`).toBeGreaterThan(0);
            expect(new Set(referencedVersions), `${relativePath} should not request stale offline assets`)
                .toEqual(new Set([releaseVersion]));
        }
    });
});
