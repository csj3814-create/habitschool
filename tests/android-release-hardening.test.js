import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(TEST_DIR, '..');

function readRepoFile(relativePath) {
    return readFileSync(resolve(ROOT_DIR, relativePath), 'utf8');
}

describe('Android release hardening', () => {
    it('keeps assetlinks checks tolerant of additional fingerprints by default', () => {
        const syncAssetLinksSource = readRepoFile('android/scripts/Sync-AssetLinks.ps1');

        expect(syncAssetLinksSource).toContain('[switch]$ExactMatch');
        expect(syncAssetLinksSource).toContain('Expected fingerprints are present, so the current assetlinks entry is usable.');
    });

    it('keeps hosted APK preparation gated by current signing hints before preferring release artifacts', () => {
        const prepareHostedApkSource = readRepoFile('scripts/prepare-hosted-apk.js');

        expect(prepareHostedApkSource).toContain('const releaseApkPath');
        expect(prepareHostedApkSource).toContain('const hasReleaseSigning = hasAnyReleaseSigningHints();');
        expect(prepareHostedApkSource).toContain('release APK가 있지만 현재 signing 힌트가 없어 stale artifact로 보고 무시합니다.');
        expect(prepareHostedApkSource).toContain('if (require.main === module)');
    });

    it('resolves relative release keystore paths from the android root so the sample signing config actually works', () => {
        const gradleSource = readRepoFile('android/app/build.gradle.kts');

        expect(gradleSource).toContain('fun resolveSigningStoreFile(path: String): File');
        expect(gradleSource).toContain('return if (candidate.isAbsolute) candidate else rootProject.file(path)');
        expect(gradleSource).toContain('storeFile = resolveSigningStoreFile(releaseSigning.getValue("storeFile")!!)');
    });
});
