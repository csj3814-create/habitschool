import { describe, expect, it, vi } from 'vitest';

import {
    APP_EXPERIENCE_STATES,
    DEMO_ACTIONS,
    DEMO_TABS,
    GUEST_DEMO_IMAGES,
    GUEST_DEMO_MODELS,
    GUEST_DEMO_POINTS,
    GUEST_DEMO_STORAGE_KEY,
    LEGACY_GUEST_GALLERY_CACHE_KEY,
    applyGuestDemoAction,
    createGuestDemoController,
    createGuestDemoSession,
    createPendingGuestIntent,
    disableGuestDemoCoaches,
    formatGuestActivityStats,
    getGuestDemoCategoryProgress,
    getGuestDemoPoints,
    isAllowedGuestDemoImage,
    loadGuestDemoSession,
    normalizeGuestActivityStats,
    parseGuestDemoSession,
    removeLegacyGuestGalleryCache,
    renderGuestDemoTab,
    resolveGuestDemoActionPolicy,
    saveGuestDemoSession,
    visitGuestDemoTab
} from '../js/guest-demo.js';

function createMemoryStorage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return {
        getItem: vi.fn((key) => values.has(key) ? values.get(key) : null),
        setItem: vi.fn((key, value) => values.set(key, String(value))),
        removeItem: vi.fn((key) => values.delete(key)),
        snapshot: () => Object.fromEntries(values)
    };
}

function runAction(session, action) {
    const result = applyGuestDemoAction(session, action);
    expect(result.accepted).toBe(true);
    return result.session;
}

describe('guest demo session', () => {
    it('starts with the documented six-tab, session-only contract', () => {
        const session = createGuestDemoSession(1234);

        expect(DEMO_TABS).toEqual(['gallery', 'diet', 'exercise', 'sleep', 'dashboard', 'assets']);
        expect(session).toMatchObject({
            version: 1,
            activeTab: 'gallery',
            visitedTabs: [],
            completedActions: [],
            pendingIntent: null,
            startedAt: 1234
        });
    });

    it('persists, restores, sanitizes, and clears no data outside session storage', () => {
        const storage = createMemoryStorage();
        const dirtySession = {
            ...createGuestDemoSession(2222),
            activeTab: 'diet',
            visitedTabs: ['diet', 'diet', 'profile'],
            completedActions: [DEMO_ACTIONS.DIET_SELECT_SAMPLE, 'unknown_action'],
            pendingIntent: { tab: 'diet', action: 'select_real_file', healthValue: 'must be dropped' },
            unknownField: 'must be dropped'
        };

        expect(saveGuestDemoSession(dirtySession, storage)).toBe(true);
        expect(Object.keys(storage.snapshot())).toEqual([GUEST_DEMO_STORAGE_KEY]);
        expect(loadGuestDemoSession(storage, 3333)).toEqual({
            version: 1,
            activeTab: 'diet',
            visitedTabs: ['diet'],
            completedActions: [DEMO_ACTIONS.DIET_SELECT_SAMPLE],
            pendingIntent: { tab: 'diet', action: 'select_real_file' },
            startedAt: 2222,
            coachesDisabled: false
        });
    });

    it('rejects corrupt and incompatible stored versions', () => {
        expect(parseGuestDemoSession('{bad json')).toBeNull();
        expect(parseGuestDemoSession(JSON.stringify({ version: 999 }))).toBeNull();
        expect(parseGuestDemoSession(null)).toBeNull();
    });

    it('removes only the old persistent guest gallery cache', () => {
        const storage = createMemoryStorage({
            [LEGACY_GUEST_GALLERY_CACHE_KEY]: 'private cached payload',
            keep: 'yes'
        });

        expect(removeLegacyGuestGalleryCache(storage)).toBe(true);
        expect(storage.snapshot()).toEqual({ keep: 'yes' });
    });

    it('shows a coach once per tab and can disable every remaining coach', () => {
        let session = createGuestDemoSession(1000);
        const first = visitGuestDemoTab(session, 'diet');
        expect(first.firstVisit).toBe(true);
        session = first.session;

        const second = visitGuestDemoTab(session, 'diet');
        expect(second.firstVisit).toBe(false);
        expect(second.session.visitedTabs).toEqual(['diet']);

        session = disableGuestDemoCoaches(second.session);
        expect(session.coachesDisabled).toBe(true);
        expect(renderGuestDemoTab('exercise', session, { showCoach: true })).not.toContain('guest-demo-coach-actions');
    });
});

describe('guest demo point simulation', () => {
    it('requires the sample flow before save and awards each category only once', () => {
        let session = createGuestDemoSession(1000);
        const tooEarly = applyGuestDemoAction(session, DEMO_ACTIONS.DIET_SAVE);
        expect(tooEarly).toMatchObject({
            accepted: false,
            pointsAdded: 0,
            missingRequirements: [DEMO_ACTIONS.DIET_VIEW_AI]
        });

        session = runAction(session, DEMO_ACTIONS.DIET_SELECT_SAMPLE);
        session = runAction(session, DEMO_ACTIONS.DIET_VIEW_AI);
        const firstSave = applyGuestDemoAction(session, DEMO_ACTIONS.DIET_SAVE);
        expect(firstSave.pointsAdded).toBe(30);
        session = firstSave.session;

        const duplicateSave = applyGuestDemoAction(session, DEMO_ACTIONS.DIET_SAVE);
        expect(duplicateSave).toMatchObject({
            accepted: true,
            alreadyCompleted: true,
            pointsAdded: 0
        });
    });

    it('moves exactly from 1,920P through 30+30+20P to the first 2,000P coupon', () => {
        let session = createGuestDemoSession(1000);
        expect(getGuestDemoPoints(session)).toEqual({
            base: 1920,
            earned: 0,
            total: 1920,
            target: 2000,
            remaining: 80
        });

        session = runAction(session, DEMO_ACTIONS.DIET_SELECT_SAMPLE);
        session = runAction(session, DEMO_ACTIONS.DIET_VIEW_AI);
        session = runAction(session, DEMO_ACTIONS.DIET_SAVE);
        expect(getGuestDemoPoints(session).total).toBe(1950);

        session = runAction(session, DEMO_ACTIONS.EXERCISE_REVIEW_SAMPLE);
        session = runAction(session, DEMO_ACTIONS.EXERCISE_SAVE);
        expect(getGuestDemoPoints(session).total).toBe(1980);

        session = runAction(session, DEMO_ACTIONS.SLEEP_REVIEW_SAMPLE);
        session = runAction(session, DEMO_ACTIONS.SLEEP_SAVE);
        expect(getGuestDemoPoints(session)).toEqual({
            base: GUEST_DEMO_POINTS.base,
            earned: 80,
            total: GUEST_DEMO_POINTS.couponTarget,
            target: GUEST_DEMO_POINTS.couponTarget,
            remaining: 0
        });
        expect(getGuestDemoCategoryProgress(session)).toEqual({
            diet: true,
            exercise: true,
            sleep: true
        });
    });
});

describe('guest demo models and renderers', () => {
    it('uses only three fixed, local WebP assets and fixed synthetic identities', () => {
        expect(Object.values(GUEST_DEMO_IMAGES)).toEqual([
            '/assets/guest-demo/meal.webp',
            '/assets/guest-demo/exercise.webp',
            '/assets/guest-demo/mind.webp'
        ]);
        Object.values(GUEST_DEMO_IMAGES).forEach((path) => {
            expect(isAllowedGuestDemoImage(path)).toBe(true);
            expect(path.endsWith('.webp')).toBe(true);
            expect(path.startsWith('/assets/guest-demo/')).toBe(true);
        });
        expect(isAllowedGuestDemoImage('https://firebasestorage.googleapis.com/private.jpg')).toBe(false);
        expect(GUEST_DEMO_MODELS.gallery.dayLabel).toBe('체험 1일차');
        expect(GUEST_DEMO_MODELS.gallery.posts.map((post) => post.author)).toEqual([
            '해빛 예시 A',
            '해빛 예시 B',
            '해빛 예시 C'
        ]);
    });

    it('renders all six tabs as explicit examples without real input or remote media', () => {
        const session = createGuestDemoSession(1000);
        const allHtml = DEMO_TABS.map((tab) => renderGuestDemoTab(tab, session, {
            showCoach: true,
            activityStats: { recordCountBucket: '100+', activeUserCountBucket: '25+' }
        })).join('\n');

        DEMO_TABS.forEach((tab) => {
            const tabHtml = renderGuestDemoTab(tab, session, { showCoach: true });
            expect(tabHtml).toContain(`data-guest-demo-tab="${tab}"`);
            expect(tabHtml).toContain('guest-demo-coach-active');
            expect(tabHtml).toContain('data-guest-demo-coach-target');
        });
        expect(allHtml).toContain('체험 모드');
        expect(allHtml).toContain('모든 기록과 반응은 사용법을 위한 예시입니다');
        expect(allHtml).not.toMatch(/<input\b/i);
        expect(allHtml).not.toContain('firebase');
        expect(allHtml).not.toMatch(/https?:\/\//i);

        const imageSources = [...allHtml.matchAll(/<img[^>]+src="([^"]+)"/g)].map((match) => match[1]);
        expect(imageSources.length).toBeGreaterThan(0);
        imageSources.forEach((path) => expect(isAllowedGuestDemoImage(path)).toBe(true));

        const cards = allHtml.split(/<article class="guest-demo-card/).slice(1);
        expect(cards.length).toBeGreaterThan(0);
        cards.forEach((card) => {
            expect(card.split('</article>')[0]).toContain('예시 기록');
        });
    });

    it('shows bucketed activity, generic low-volume copy, and nothing on read failure', () => {
        expect(normalizeGuestActivityStats({
            windowDays: 90,
            recordCountBucket: '100+',
            activeUserCountBucket: '<script>'
        })).toEqual({
            windowDays: 7,
            recordCountBucket: '100+',
            activeUserCountBucket: '',
            updatedAt: null
        });
        expect(formatGuestActivityStats({ recordCountBucket: '100+' }))
            .toBe('최근 7일 실제 기록 활동 100+건 · 개인정보 없는 익명 집계');
        expect(formatGuestActivityStats({ recordCountBucket: '', activeUserCountBucket: '' }))
            .toBe('최근에도 건강 기록이 이어지고 있어요 · 개인정보 없는 익명 집계');
        expect(formatGuestActivityStats(null)).toBe('');
        expect(renderGuestDemoTab('gallery', createGuestDemoSession(), { activityStats: null }))
            .not.toContain('guest-demo-activity-signal');
    });
});

describe('guest demo action boundary and controller', () => {
    it('keeps local simulation separate from actions that require login', () => {
        expect(resolveGuestDemoActionPolicy(DEMO_ACTIONS.DIET_SELECT_SAMPLE)).toBe('local');
        expect(resolveGuestDemoActionPolicy('select_real_file')).toBe('login_required');
        expect(resolveGuestDemoActionPolicy('open_camera')).toBe('login_required');
        expect(resolveGuestDemoActionPolicy('run_real_ai')).toBe('login_required');
        expect(resolveGuestDemoActionPolicy('redeem_coupon')).toBe('login_required');
        expect(resolveGuestDemoActionPolicy('open_wallet')).toBe('login_required');
        expect(resolveGuestDemoActionPolicy('unknown')).toBe('blocked');
        expect(createPendingGuestIntent('diet', 'select_real_file')).toEqual({
            tab: 'diet',
            action: 'select_real_file'
        });
        expect(createPendingGuestIntent('diet', 'unknown')).toBeNull();
    });

    it('retains demo state after failed login and returns the exact intent after success', () => {
        const storage = createMemoryStorage();
        const persistentStorage = createMemoryStorage({ [LEGACY_GUEST_GALLERY_CACHE_KEY]: 'old' });
        const events = [];
        const intents = [];
        const stateChanges = [];
        const root = { innerHTML: '' };
        const controller = createGuestDemoController({
            storage,
            persistentStorage,
            root,
            onEvent: (name, payload) => events.push({ name, payload }),
            onLoginIntent: (intent) => intents.push(intent),
            onStateChange: (state) => stateChanges.push(state)
        });

        controller.start({ entryPoint: 'login_modal', now: 1000 });
        controller.openTab('diet');
        expect(controller.getState()).toBe(APP_EXPERIENCE_STATES.GUEST_DEMO);
        expect(root.innerHTML).toContain('data-guest-demo-tab="diet"');
        expect(persistentStorage.snapshot()).toEqual({});

        expect(controller.requestLogin('select_real_file', 'diet')).toEqual({
            tab: 'diet',
            action: 'select_real_file'
        });
        expect(intents).toEqual([{ tab: 'diet', action: 'select_real_file' }]);

        expect(controller.finishAuthentication(false)).toBeNull();
        expect(controller.getState()).toBe(APP_EXPERIENCE_STATES.GUEST_DEMO);
        expect(loadGuestDemoSession(storage)?.pendingIntent).toEqual({
            tab: 'diet',
            action: 'select_real_file'
        });

        expect(controller.finishAuthentication(true)).toEqual({
            tab: 'diet',
            action: 'select_real_file'
        });
        expect(controller.getState()).toBe(APP_EXPERIENCE_STATES.AUTHENTICATED);
        expect(controller.getSession()).toBeNull();
        expect(storage.snapshot()).toEqual({});
        expect(root.innerHTML).toBe('');
        expect(stateChanges).toContain(APP_EXPERIENCE_STATES.GUEST_DEMO);
        expect(stateChanges.at(-1)).toBe(APP_EXPERIENCE_STATES.AUTHENTICATED);

        expect(events).toContainEqual({
            name: 'guest_demo_signup_click',
            payload: { tab: 'diet', action: 'select_real_file' }
        });
        events.forEach(({ payload }) => {
            expect(payload).not.toHaveProperty('uid');
            expect(payload).not.toHaveProperty('email');
            expect(payload).not.toHaveProperty('photoUrl');
            expect(payload).not.toHaveProperty('healthValue');
        });
    });

    it('updates local filter, lightbox, reaction, and simulation state without side effects', () => {
        const storage = createMemoryStorage();
        const controller = createGuestDemoController({ storage, persistentStorage: null });
        controller.start({ now: 1000 });

        controller.completeAction(DEMO_ACTIONS.GALLERY_FILTER_DIET);
        expect(controller.getUiState().galleryFilter).toBe('diet');
        controller.completeAction(DEMO_ACTIONS.GALLERY_VIEW_MEDIA, { mediaId: 'sample-a' });
        expect(controller.getUiState().selectedMediaId).toBe('sample-a');
        expect(controller.render()).toContain('guest-demo-lightbox');
        controller.completeAction(DEMO_ACTIONS.GALLERY_REACT, { postId: 'sample-a' });
        expect(controller.getUiState().reactedPostIds).toEqual(['sample-a']);
        controller.completeAction(DEMO_ACTIONS.GALLERY_CLOSE_MEDIA);
        expect(controller.getUiState().selectedMediaId).toBe('');
        expect(controller.getSession().completedActions).toEqual([]);

        expect(controller.openTab('profile')).toBe(false);
        expect(controller.getSession().activeTab).toBe('gallery');
    });
});
