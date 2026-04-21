import { describe, expect, it } from 'vitest';
import { readAppSource } from './source-helpers.js';

describe('gallery loading hardening', () => {
    it('does not block the first gallery render on friendship loading and can recover from stale in-flight loads', () => {
        const appSource = readAppSource();

        expect(appSource).toContain('const GALLERY_LOAD_TIMEOUT_MS = 6000;');
        expect(appSource).toContain('const GALLERY_LOADING_STALE_RESET_MS = GALLERY_LOAD_TIMEOUT_MS * 2;');
        expect(appSource).toContain('let _galleryLoadingStartedAt = 0;');
        expect(appSource).toContain('let _galleryLoadGeneration = 0;');
        expect(appSource).toContain("console.warn('[loadGalleryData] stale gallery load discarded');");
        expect(appSource).toContain('function rerenderGalleryFeedIfVisible() {');
        expect(appSource).toContain('loadMyFriendships()');
        expect(appSource).not.toContain('await friendsPromise;');
    });

    it('wraps both REST and Firestore gallery fetches in explicit timeouts', () => {
        const appSource = readAppSource();

        expect(appSource).toContain("_fetchGalleryViaRest(cutoffStr, MAX_CACHE_SIZE)");
        expect(appSource).toContain('getDocs(q)');
        expect(appSource).toContain('갤러리 REST 조회 시간이 초과되었어요.');
        expect(appSource).toContain('갤러리 Firestore 조회 시간이 초과되었어요.');
    });
    it('forces a fresh reload when guest gallery cache survives into an authenticated session', () => {
        const appSource = readAppSource();

        expect(appSource).toContain("let galleryCacheAudience = 'unknown';");
        expect(appSource).toContain("const expectedGalleryAudience = user ? 'auth' : 'guest';");
        expect(appSource).toContain('const shouldFetchFresh = forceReload || !hadCachedLogs || galleryCacheAudience !== expectedGalleryAudience;');
        expect(appSource).toContain("galleryCacheAudience = 'guest';");
        expect(appSource).toContain("galleryCacheAudience = 'auth';");
    });
});
