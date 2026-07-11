import { describe, expect, it } from 'vitest';
import { readAppSource, readFunctionsSource, readRepoFile } from './source-helpers.js';

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

    it('loads the authenticated gallery_posts feed through timeout-bounded SDK and REST paths', () => {
        const appSource = readAppSource();
        const restStart = appSource.indexOf('async function _fetchGalleryViaRest');
        const restEnd = appSource.indexOf('async function _applyGalleryRestFallback', restStart);
        const galleryRestSource = appSource.slice(restStart, restEnd);

        expect(restStart).toBeGreaterThan(-1);
        expect(restEnd).toBeGreaterThan(restStart);
        expect(galleryRestSource).toContain("if (!currentUser) throw new Error('gallery REST API requires authentication');");
        expect(galleryRestSource).toContain("from: [{ collectionId: 'gallery_posts' }]");
        expect(galleryRestSource).not.toContain('daily_logs');
        expect(appSource).toContain('_fetchGalleryViaRest(cutoffStr, limitCount)');
        expect(appSource).toContain("'gallery_rest_fallback_timeout'");
        expect(appSource).toContain("await _applyGalleryRestFallback(cutoffStr, 'auth');");
        expect(appSource).toMatch(/catch \(e\) \{[\s\S]*?if \(!hadCachedLogs\) \{[\s\S]*?_applyGalleryRestFallback\(cutoffStr, 'auth'\);[\s\S]*?if \(retries < 3\)/);
        expect(appSource).toContain("scheduleGalleryRetry(user.uid, 'auth-gallery-load-failed');");
        expect(appSource).toContain('gallery_firestore_cache_empty_offline');
        expect(appSource).toContain('const snapshotFromCache = !!snapshot.metadata?.fromCache;');
        expect(appSource).toContain("scheduleGalleryRetry(user.uid, 'auth-gallery-cache-only');");
        expect(appSource).toContain("noteFirestoreConnectivityFailure(e, 'loadGalleryData');");
        expect(appSource).toContain('query(collection(db, "gallery_posts"), orderBy("updatedAt", "desc"), limit(FIRESTORE_PAGE_SIZE))');
        expect(appSource).toMatch(/withAsyncTimeout\(\s*getDocs\(q\),\s*GALLERY_LOAD_TIMEOUT_MS,/);
    });

    it('never persists or hydrates the real gallery for guests and removes the legacy guest cache', () => {
        const appSource = readAppSource();
        const guestDemoSource = readRepoFile('js/guest-demo.js');

        expect(appSource).toContain("let galleryCacheAudience = 'unknown';");
        expect(appSource).toContain("if (audience !== 'auth') return '';");
        expect(appSource).toContain("if (audience !== 'auth' || !uid) return false;");
        expect(appSource).toContain("localStorage.removeItem('habitschool_gallery_cache_v1_guest_guest')");
        expect(appSource).not.toContain("galleryCacheAudience = 'guest';");
        expect(appSource).toContain("galleryCacheAudience = 'auth';");
        expect(guestDemoSource).toContain("export const LEGACY_GUEST_GALLERY_CACHE_KEY = 'habitschool_gallery_cache_v1_guest_guest';");
        expect(guestDemoSource).toContain('storage.removeItem(LEGACY_GUEST_GALLERY_CACHE_KEY);');
    });

    it('unshares through the private source instead of mutating the server projection', () => {
        const appSource = readAppSource();
        const rulesSource = readRepoFile('firestore.rules');

        expect(appSource).not.toContain('deleteDoc(doc(db, "gallery_posts", docId))');
        expect(appSource).toContain("await setDoc(doc(db, 'daily_logs', sourceLogId), {");
        expect(appSource).toContain('hideDiet: true');
        expect(appSource).toContain('hideExercise: true');
        expect(appSource).toContain('hideMind: true');
        expect(appSource).toContain('개인 기록은 내 기록에 그대로 유지됩니다.');
        expect(rulesSource).toContain('allow create, update, delete: if false;');
    });

    it('keeps stale triggers and comment races from recreating an unshared projection', () => {
        const functionsSource = readFunctionsSource();
        const projectionSource = readRepoFile('functions/gallery-posts.js');

        expect(projectionSource).toContain('readExistingPost(sourceReference, transaction)');
        expect(projectionSource).toContain('readExistingPost(reference, transaction)');
        expect(projectionSource).not.toContain('const source = getDocumentData(after);');
        expect(functionsSource).toContain('{ document: "daily_logs/{logId}", region: "asia-northeast3", retry: true }');
        expect(functionsSource).toContain('const postRef = db.doc(`gallery_posts/${postId}`);');
        expect(functionsSource).toContain('await db.runTransaction(async (tx) => {');
        expect(functionsSource).toContain('tx.update(postRef, {');
        expect(functionsSource).not.toContain('await db.doc(`gallery_posts/${postId}`).set({\n            comments:');
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
