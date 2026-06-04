import { describe, expect, it } from 'vitest';
import { readAppSource, readRepoFile } from './source-helpers.js';

describe('gallery loading hardening', () => {
    it('does not block the first gallery render on friendship loading and can recover from stale in-flight loads', () => {
        const appSource = readAppSource();

        expect(appSource).toContain('const GALLERY_LOAD_TIMEOUT_MS = 6000;');
        expect(appSource).toContain('const GALLERY_LOADING_STALE_RESET_MS = GALLERY_LOAD_TIMEOUT_MS * 2;');
        expect(appSource).toContain('const GALLERY_RETRY_BASE_DELAY_MS = 2500;');
        expect(appSource).toContain('const GALLERY_MAX_RETRY_ATTEMPTS = 3;');
        expect(appSource).toContain('let _galleryLoadingStartedAt = 0;');
        expect(appSource).toContain('let _galleryLoadGeneration = 0;');
        expect(appSource).toContain("const GALLERY_PERSISTENT_CACHE_PREFIX = 'habitschool_gallery_cache_v1';");
        expect(appSource).toContain('function hydrateGalleryFromPersistentCache');
        expect(appSource).toContain('function mergeGalleryLogsForProvisionalCache');
        expect(appSource).toContain('writePersistentGalleryCache');
        expect(appSource).toContain('function scheduleGalleryRetry');
        expect(appSource).toContain("console.warn('[loadGalleryData] stale gallery load discarded');");
        expect(appSource).toContain('function rerenderGalleryFeedIfVisible() {');
        expect(appSource).toContain('loadMyFriendships()');
        expect(appSource).not.toContain('await friendsPromise;');
    });

    it('wraps both REST and Firestore gallery fetches in explicit timeouts', () => {
        const appSource = readAppSource();

        expect(appSource).toContain("_fetchGalleryViaRest(cutoffStr, MAX_CACHE_SIZE)");
        expect(appSource).toContain("await _applyGalleryRestFallback(cutoffStr, 'auth');");
        expect(appSource).toMatch(/catch \(e\) \{[\s\S]*?if \(!hadCachedLogs\) \{[\s\S]*?_applyGalleryRestFallback\(cutoffStr, 'auth'\);[\s\S]*?if \(retries < 3\)/);
        expect(appSource).toContain("scheduleGalleryRetry(user.uid, 'auth-gallery-load-failed');");
        expect(appSource).toContain('gallery_firestore_cache_empty_offline');
        expect(appSource).toContain('const snapshotFromCache = !!snapshot.metadata?.fromCache;');
        expect(appSource).toContain("scheduleGalleryRetry(user.uid, 'auth-gallery-cache-only');");
        expect(appSource).toContain("noteFirestoreConnectivityFailure(e, 'loadGalleryData');");
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

    it('keeps the gallery chat CTA as direct OpenChat entry without account-link gating', () => {
        const appSource = readAppSource();
        const htmlSource = readRepoFile('index.html');

        expect(appSource).toContain("const COMMUNITY_CHAT_URL = 'https://open.kakao.com/o/gv23urgi';");
        expect(appSource).toContain('function openCommunityChat()');
        expect(appSource).toContain('window.openCommunityChat = openCommunityChat;');
        expect(appSource).toContain("if (mode === 'chat')");
        expect(appSource).toContain('openCommunityChat();');
        expect(htmlSource).toContain('id="chat-banner"');
        expect(htmlSource).toContain('onclick="openCommunityChat()"');
        expect(htmlSource).not.toContain('id="chat-banner"\n                onclick="openChatbotKakaoChat()');
    });
});
