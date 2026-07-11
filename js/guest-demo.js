/**
 * HabitSchool guest demo.
 *
 * This module is deliberately dependency-free. It never imports Firebase, opens
 * a picker, or performs network IO. The host app owns authentication, history,
 * analytics transport, and the public aggregate read; this module only returns
 * sanitized callback payloads for those integrations.
 */

export const GUEST_DEMO_VERSION = 1;
export const GUEST_DEMO_STORAGE_KEY = 'habitschool_guest_demo_v1';
export const LEGACY_GUEST_GALLERY_CACHE_KEY = 'habitschool_gallery_cache_v1_guest_guest';

export const APP_EXPERIENCE_STATES = Object.freeze({
    SIGNED_OUT: 'signed_out',
    GUEST_DEMO: 'guest_demo',
    AUTHENTICATED: 'authenticated'
});

export const DEMO_TABS = Object.freeze([
    'gallery',
    'diet',
    'exercise',
    'sleep',
    'dashboard',
    'assets'
]);

export const GUEST_DEMO_IMAGES = Object.freeze({
    diet: '/assets/guest-demo/meal.webp',
    exercise: '/assets/guest-demo/exercise.webp',
    sleep: '/assets/guest-demo/mind.webp'
});

export const GUEST_DEMO_POINTS = Object.freeze({
    base: 1920,
    diet: 30,
    exercise: 30,
    sleep: 20,
    couponTarget: 2000
});

export const DEMO_ACTIONS = Object.freeze({
    DIET_SELECT_SAMPLE: 'diet_sample_selected',
    DIET_VIEW_AI: 'diet_ai_result_viewed',
    DIET_SAVE: 'diet_saved',
    EXERCISE_REVIEW_SAMPLE: 'exercise_sample_reviewed',
    EXERCISE_SAVE: 'exercise_saved',
    SLEEP_REVIEW_SAMPLE: 'sleep_sample_reviewed',
    SLEEP_SAVE: 'sleep_saved',
    GALLERY_FILTER_ALL: 'gallery_filter_all',
    GALLERY_FILTER_DIET: 'gallery_filter_diet',
    GALLERY_FILTER_EXERCISE: 'gallery_filter_exercise',
    GALLERY_FILTER_SLEEP: 'gallery_filter_sleep',
    GALLERY_VIEW_MEDIA: 'gallery_view_media',
    GALLERY_CLOSE_MEDIA: 'gallery_close_media',
    GALLERY_REACT: 'gallery_reacted'
});

export const LOGIN_REQUIRED_ACTIONS = Object.freeze([
    'start_record',
    'select_real_file',
    'open_camera',
    'run_real_ai',
    'save_real_record',
    'upload_media',
    'post_comment',
    'share_record',
    'redeem_coupon',
    'open_wallet',
    'open_profile'
]);

const DEMO_TAB_SET = new Set(DEMO_TABS);
const LOGIN_REQUIRED_ACTION_SET = new Set(LOGIN_REQUIRED_ACTIONS);
const ACTIVITY_BUCKETS = new Set(['10+', '25+', '50+', '100+', '250+', '500+']);
const ENTRY_POINTS = new Set(['login_modal', 'gallery_cta', 'tab_guard', 'unknown']);

const ACTION_DEFINITIONS = Object.freeze({
    [DEMO_ACTIONS.DIET_SELECT_SAMPLE]: Object.freeze({ tab: 'diet', requires: [] }),
    [DEMO_ACTIONS.DIET_VIEW_AI]: Object.freeze({
        tab: 'diet',
        requires: [DEMO_ACTIONS.DIET_SELECT_SAMPLE]
    }),
    [DEMO_ACTIONS.DIET_SAVE]: Object.freeze({
        tab: 'diet',
        requires: [DEMO_ACTIONS.DIET_VIEW_AI],
        points: GUEST_DEMO_POINTS.diet
    }),
    [DEMO_ACTIONS.EXERCISE_REVIEW_SAMPLE]: Object.freeze({ tab: 'exercise', requires: [] }),
    [DEMO_ACTIONS.EXERCISE_SAVE]: Object.freeze({
        tab: 'exercise',
        requires: [DEMO_ACTIONS.EXERCISE_REVIEW_SAMPLE],
        points: GUEST_DEMO_POINTS.exercise
    }),
    [DEMO_ACTIONS.SLEEP_REVIEW_SAMPLE]: Object.freeze({ tab: 'sleep', requires: [] }),
    [DEMO_ACTIONS.SLEEP_SAVE]: Object.freeze({
        tab: 'sleep',
        requires: [DEMO_ACTIONS.SLEEP_REVIEW_SAMPLE],
        points: GUEST_DEMO_POINTS.sleep
    }),
    [DEMO_ACTIONS.GALLERY_FILTER_ALL]: Object.freeze({ tab: 'gallery', requires: [], persist: false }),
    [DEMO_ACTIONS.GALLERY_FILTER_DIET]: Object.freeze({ tab: 'gallery', requires: [], persist: false }),
    [DEMO_ACTIONS.GALLERY_FILTER_EXERCISE]: Object.freeze({ tab: 'gallery', requires: [], persist: false }),
    [DEMO_ACTIONS.GALLERY_FILTER_SLEEP]: Object.freeze({ tab: 'gallery', requires: [], persist: false }),
    [DEMO_ACTIONS.GALLERY_VIEW_MEDIA]: Object.freeze({ tab: 'gallery', requires: [], persist: false }),
    [DEMO_ACTIONS.GALLERY_CLOSE_MEDIA]: Object.freeze({ tab: 'gallery', requires: [], persist: false }),
    [DEMO_ACTIONS.GALLERY_REACT]: Object.freeze({ tab: 'gallery', requires: [], persist: false })
});

const PERSISTED_ACTION_SET = new Set(
    Object.entries(ACTION_DEFINITIONS)
        .filter(([, definition]) => definition.persist !== false)
        .map(([action]) => action)
);

const POINT_ACTIONS = Object.freeze({
    [DEMO_ACTIONS.DIET_SAVE]: GUEST_DEMO_POINTS.diet,
    [DEMO_ACTIONS.EXERCISE_SAVE]: GUEST_DEMO_POINTS.exercise,
    [DEMO_ACTIONS.SLEEP_SAVE]: GUEST_DEMO_POINTS.sleep
});

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
}

export const GUEST_DEMO_MODELS = deepFreeze({
    gallery: {
        dayLabel: '체험 1일차',
        posts: [
            {
                id: 'sample-a',
                author: '해빛 예시 A',
                category: 'diet',
                categoryLabel: '식단',
                image: GUEST_DEMO_IMAGES.diet,
                summary: '채소와 단백질을 함께 챙긴 점심',
                points: 30,
                reactions: 12
            },
            {
                id: 'sample-b',
                author: '해빛 예시 B',
                category: 'exercise',
                categoryLabel: '운동',
                image: GUEST_DEMO_IMAGES.exercise,
                summary: '8,400보와 가벼운 근력 운동',
                points: 30,
                reactions: 8
            },
            {
                id: 'sample-c',
                author: '해빛 예시 C',
                category: 'sleep',
                categoryLabel: '마음',
                image: GUEST_DEMO_IMAGES.sleep,
                summary: '충분한 수면과 5분 명상',
                points: 20,
                reactions: 5
            }
        ]
    },
    diet: {
        title: '균형 잡힌 점심',
        image: GUEST_DEMO_IMAGES.diet,
        aiResult: '채소·단백질·탄수화물이 고르게 담긴 식사예요.',
        points: 30
    },
    exercise: {
        title: '걷기와 가벼운 근력 운동',
        image: GUEST_DEMO_IMAGES.exercise,
        stepsLabel: '8,400보',
        durationLabel: '걷기 35분 · 근력 10분',
        points: 30
    },
    sleep: {
        title: '수면과 명상',
        image: GUEST_DEMO_IMAGES.sleep,
        sleepLabel: '수면 7시간 20분',
        meditationLabel: '명상 5분',
        points: 20
    }
});

function uniqueAllowedStrings(values, allowedSet = null) {
    if (!Array.isArray(values)) return [];
    const normalized = values
        .map((value) => String(value || '').trim())
        .filter((value) => value && (!allowedSet || allowedSet.has(value)));
    return [...new Set(normalized)];
}

function normalizeStartedAt(value, fallback = Date.now()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : Number(fallback) || Date.now();
}

export function isDemoTab(tab) {
    return DEMO_TAB_SET.has(String(tab || '').trim());
}

export function normalizeDemoTab(tab, fallback = 'gallery') {
    const normalized = String(tab || '').trim();
    if (DEMO_TAB_SET.has(normalized)) return normalized;
    return DEMO_TAB_SET.has(fallback) ? fallback : 'gallery';
}

export function createPendingGuestIntent(tab = 'gallery', action = 'start_record') {
    const normalizedAction = String(action || '').trim();
    if (!LOGIN_REQUIRED_ACTION_SET.has(normalizedAction)) return null;
    return {
        tab: normalizeDemoTab(tab),
        action: normalizedAction
    };
}

export function createGuestDemoSession(now = Date.now()) {
    return {
        version: GUEST_DEMO_VERSION,
        activeTab: 'gallery',
        visitedTabs: [],
        completedActions: [],
        pendingIntent: null,
        startedAt: normalizeStartedAt(now),
        coachesDisabled: false
    };
}

export function normalizeGuestDemoSession(value, now = Date.now()) {
    if (!value || typeof value !== 'object' || Number(value.version) !== GUEST_DEMO_VERSION) {
        return null;
    }

    const activeTab = normalizeDemoTab(value.activeTab);
    const visitedTabs = uniqueAllowedStrings(value.visitedTabs, DEMO_TAB_SET);
    const completedActions = uniqueAllowedStrings(
        value.completedActions,
        PERSISTED_ACTION_SET
    );
    const pendingIntent = value.pendingIntent
        ? createPendingGuestIntent(value.pendingIntent.tab || activeTab, value.pendingIntent.action)
        : null;

    return {
        version: GUEST_DEMO_VERSION,
        activeTab,
        visitedTabs,
        completedActions,
        pendingIntent,
        startedAt: normalizeStartedAt(value.startedAt, now),
        coachesDisabled: value.coachesDisabled === true
    };
}

export function parseGuestDemoSession(rawValue, now = Date.now()) {
    if (!rawValue) return null;
    try {
        const parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
        return normalizeGuestDemoSession(parsed, now);
    } catch (_) {
        return null;
    }
}

export function loadGuestDemoSession(storage = getDefaultSessionStorage(), now = Date.now()) {
    if (!storage || typeof storage.getItem !== 'function') return null;
    try {
        return parseGuestDemoSession(storage.getItem(GUEST_DEMO_STORAGE_KEY), now);
    } catch (_) {
        return null;
    }
}

export function saveGuestDemoSession(session, storage = getDefaultSessionStorage()) {
    const normalized = normalizeGuestDemoSession(session);
    if (!normalized || !storage || typeof storage.setItem !== 'function') return false;
    try {
        storage.setItem(GUEST_DEMO_STORAGE_KEY, JSON.stringify(normalized));
        return true;
    } catch (_) {
        return false;
    }
}

export function clearGuestDemoSession(storage = getDefaultSessionStorage()) {
    if (!storage || typeof storage.removeItem !== 'function') return false;
    try {
        storage.removeItem(GUEST_DEMO_STORAGE_KEY);
        return true;
    } catch (_) {
        return false;
    }
}

export function removeLegacyGuestGalleryCache(storage = getDefaultPersistentStorage()) {
    if (!storage || typeof storage.removeItem !== 'function') return false;
    try {
        storage.removeItem(LEGACY_GUEST_GALLERY_CACHE_KEY);
        return true;
    } catch (_) {
        return false;
    }
}

function getDefaultSessionStorage() {
    try {
        return typeof window !== 'undefined' ? window.sessionStorage : null;
    } catch (_) {
        return null;
    }
}

function getDefaultPersistentStorage() {
    try {
        return typeof window !== 'undefined' ? window.localStorage : null;
    } catch (_) {
        return null;
    }
}

export function visitGuestDemoTab(session, tab) {
    const normalizedSession = normalizeGuestDemoSession(session) || createGuestDemoSession();
    const normalizedTab = normalizeDemoTab(tab, normalizedSession.activeTab);
    const firstVisit = !normalizedSession.visitedTabs.includes(normalizedTab);
    return {
        firstVisit,
        session: {
            ...normalizedSession,
            activeTab: normalizedTab,
            visitedTabs: firstVisit
                ? [...normalizedSession.visitedTabs, normalizedTab]
                : [...normalizedSession.visitedTabs]
        }
    };
}

export function disableGuestDemoCoaches(session) {
    const normalizedSession = normalizeGuestDemoSession(session) || createGuestDemoSession();
    return { ...normalizedSession, coachesDisabled: true };
}

export function getGuestDemoPoints(session) {
    const normalizedSession = normalizeGuestDemoSession(session) || createGuestDemoSession();
    const earned = Object.entries(POINT_ACTIONS).reduce((sum, [action, points]) => (
        normalizedSession.completedActions.includes(action) ? sum + points : sum
    ), 0);
    return {
        base: GUEST_DEMO_POINTS.base,
        earned,
        total: GUEST_DEMO_POINTS.base + earned,
        target: GUEST_DEMO_POINTS.couponTarget,
        remaining: Math.max(0, GUEST_DEMO_POINTS.couponTarget - (GUEST_DEMO_POINTS.base + earned))
    };
}

export function getGuestDemoCategoryProgress(session) {
    const normalizedSession = normalizeGuestDemoSession(session) || createGuestDemoSession();
    return {
        diet: normalizedSession.completedActions.includes(DEMO_ACTIONS.DIET_SAVE),
        exercise: normalizedSession.completedActions.includes(DEMO_ACTIONS.EXERCISE_SAVE),
        sleep: normalizedSession.completedActions.includes(DEMO_ACTIONS.SLEEP_SAVE)
    };
}

export function applyGuestDemoAction(session, action) {
    const normalizedSession = normalizeGuestDemoSession(session) || createGuestDemoSession();
    const normalizedAction = String(action || '').trim();
    const definition = ACTION_DEFINITIONS[normalizedAction];
    const beforePoints = getGuestDemoPoints(normalizedSession);

    if (!definition) {
        return {
            accepted: false,
            alreadyCompleted: false,
            missingRequirements: [],
            pointsAdded: 0,
            points: beforePoints,
            session: normalizedSession
        };
    }

    const missingRequirements = definition.requires.filter(
        (requiredAction) => !normalizedSession.completedActions.includes(requiredAction)
    );
    if (missingRequirements.length > 0) {
        return {
            accepted: false,
            alreadyCompleted: false,
            missingRequirements,
            pointsAdded: 0,
            points: beforePoints,
            session: normalizedSession
        };
    }

    const shouldPersist = definition.persist !== false;
    const alreadyCompleted = shouldPersist && normalizedSession.completedActions.includes(normalizedAction);
    const nextSession = alreadyCompleted || !shouldPersist
        ? normalizedSession
        : {
            ...normalizedSession,
            completedActions: [...normalizedSession.completedActions, normalizedAction]
        };
    const afterPoints = getGuestDemoPoints(nextSession);

    return {
        accepted: true,
        alreadyCompleted,
        missingRequirements: [],
        pointsAdded: afterPoints.total - beforePoints.total,
        points: afterPoints,
        session: nextSession
    };
}

export function resolveGuestDemoActionPolicy(action) {
    const normalizedAction = String(action || '').trim();
    if (ACTION_DEFINITIONS[normalizedAction]) return 'local';
    if (LOGIN_REQUIRED_ACTION_SET.has(normalizedAction)) return 'login_required';
    return 'blocked';
}

export function setPendingGuestIntent(session, tab, action) {
    const normalizedSession = normalizeGuestDemoSession(session) || createGuestDemoSession();
    const pendingIntent = createPendingGuestIntent(tab || normalizedSession.activeTab, action);
    if (!pendingIntent) return normalizedSession;
    return { ...normalizedSession, pendingIntent };
}

export function isAllowedGuestDemoImage(path) {
    return Object.values(GUEST_DEMO_IMAGES).includes(String(path || '').trim());
}

export function normalizeGuestActivityStats(value) {
    if (!value || typeof value !== 'object') return null;
    return {
        windowDays: 7,
        recordCountBucket: ACTIVITY_BUCKETS.has(value.recordCountBucket) ? value.recordCountBucket : '',
        activeUserCountBucket: ACTIVITY_BUCKETS.has(value.activeUserCountBucket) ? value.activeUserCountBucket : '',
        updatedAt: value.updatedAt || null
    };
}

export function formatGuestActivityStats(value) {
    const stats = normalizeGuestActivityStats(value);
    if (!stats) return '';
    if (stats.recordCountBucket) {
        return `최근 7일 실제 기록 활동 ${stats.recordCountBucket}건 · 개인정보 없는 익명 집계`;
    }
    return '최근에도 건강 기록이 이어지고 있어요 · 개인정보 없는 익명 집계';
}

function renderExampleBadge() {
    return '<span class="guest-demo-example-badge">예시 기록</span>';
}

function renderCoach(tab) {
    const copy = {
        gallery: ['다른 기록의 모습을 살펴보세요', '필터와 사진 확대, 반응을 체험할 수 있어요.'],
        diet: ['사진 한 장으로 식단을 기록해요', '예시 사진을 고르고 AI 설명을 확인한 뒤 저장해 보세요.'],
        exercise: ['걸음과 운동 미디어를 함께 기록해요', '8,400보 예시와 운동 미디어를 확인해 보세요.'],
        sleep: ['수면과 마음 돌봄을 간단히 남겨요', '수면과 5분 명상 예시를 확인해 보세요.'],
        dashboard: ['오늘 기록과 포인트를 한눈에 봐요', '체험에서 저장한 세 가지 기록이 바로 반영돼요.'],
        assets: ['포인트가 실제 보상으로 이어져요', '세 기록을 모두 완료하면 첫 2,000P 쿠폰에 도달해요.']
    }[tab];
    if (!copy) return '';
    return `
        <aside class="guest-demo-coach" data-guest-demo-coach="${tab}" aria-label="${copy[0]}">
            <strong>${copy[0]}</strong>
            <p>${copy[1]}</p>
            <div class="guest-demo-coach-actions">
                <button type="button" data-guest-demo-command="dismiss-coach">안내 닫기</button>
                <button type="button" data-guest-demo-command="disable-coaches">전체 안내 끄기</button>
            </div>
        </aside>`;
}

function renderButton(label, action, className = 'guest-demo-button') {
    return `<button type="button" class="${className}" data-guest-demo-action="${action}">${label}</button>`;
}

function renderLoginButton(label, action, tab, className = 'guest-demo-button guest-demo-button-primary') {
    return `<button type="button" class="${className}" data-guest-login-action="${action}" data-guest-login-tab="${tab}">${label}</button>`;
}

function renderGallery(session, uiState, activityStats) {
    const model = GUEST_DEMO_MODELS.gallery;
    const filter = ['all', 'diet', 'exercise', 'sleep'].includes(uiState.galleryFilter)
        ? uiState.galleryFilter
        : 'all';
    const visiblePosts = model.posts.filter((post) => filter === 'all' || post.category === filter);
    const statsCopy = formatGuestActivityStats(activityStats);
    const postsHtml = visiblePosts.map((post) => {
        const reacted = uiState.reactedPostIds.includes(post.id);
        return `
            <article class="guest-demo-card guest-demo-gallery-card" data-example-record="true" data-category="${post.category}">
                <header>
                    ${renderExampleBadge()}
                    <span>${model.dayLabel}</span>
                    <strong>${post.author}</strong>
                </header>
                <button type="button" class="guest-demo-media-button" data-guest-demo-action="${DEMO_ACTIONS.GALLERY_VIEW_MEDIA}" data-demo-media="${post.id}" aria-label="${post.categoryLabel} 예시 사진 크게 보기">
                    <img src="${post.image}" alt="${post.categoryLabel} 예시 기록" loading="lazy" decoding="async">
                </button>
                <div class="guest-demo-card-body">
                    <strong>${post.categoryLabel} · +${post.points}P</strong>
                    <p>${post.summary}</p>
                    <button type="button" data-guest-demo-action="${DEMO_ACTIONS.GALLERY_REACT}" data-demo-post="${post.id}" aria-pressed="${reacted}">해빛 ${post.reactions + (reacted ? 1 : 0)}</button>
                    ${renderLoginButton('댓글 남기기', 'post_comment', 'gallery', 'guest-demo-link-button')}
                </div>
            </article>`;
    }).join('');

    const selectedPost = model.posts.find((post) => post.id === uiState.selectedMediaId);
    const lightboxHtml = selectedPost ? `
        <div class="guest-demo-lightbox" role="dialog" aria-modal="true" aria-label="예시 사진 크게 보기">
            <button type="button" data-guest-demo-action="${DEMO_ACTIONS.GALLERY_CLOSE_MEDIA}" aria-label="사진 닫기">×</button>
            <img src="${selectedPost.image}" alt="${selectedPost.categoryLabel} 예시 기록 크게 보기">
            <p>${renderExampleBadge()} ${selectedPost.summary}</p>
        </div>` : '';

    return `
        ${statsCopy ? `<p class="guest-demo-activity-signal">${statsCopy}</p>` : ''}
        <nav class="guest-demo-filter" aria-label="예시 갤러리 필터" data-guest-demo-coach-target>
            ${renderButton('전체', DEMO_ACTIONS.GALLERY_FILTER_ALL)}
            ${renderButton('식단', DEMO_ACTIONS.GALLERY_FILTER_DIET)}
            ${renderButton('운동', DEMO_ACTIONS.GALLERY_FILTER_EXERCISE)}
            ${renderButton('마음', DEMO_ACTIONS.GALLERY_FILTER_SLEEP)}
        </nav>
        <div class="guest-demo-gallery-grid">${postsHtml}</div>
        ${lightboxHtml}
        <div class="guest-demo-primary-cta">${renderLoginButton('내 기록으로 시작하기', 'start_record', 'gallery')}</div>`;
}

function renderDiet(session) {
    const model = GUEST_DEMO_MODELS.diet;
    const selected = session.completedActions.includes(DEMO_ACTIONS.DIET_SELECT_SAMPLE);
    const aiViewed = session.completedActions.includes(DEMO_ACTIONS.DIET_VIEW_AI);
    const saved = session.completedActions.includes(DEMO_ACTIONS.DIET_SAVE);
    let action = renderButton('예시 사진 선택', DEMO_ACTIONS.DIET_SELECT_SAMPLE);
    if (selected && !aiViewed) action = renderButton('예시 AI 결과 확인', DEMO_ACTIONS.DIET_VIEW_AI);
    if (aiViewed && !saved) action = renderButton('예시 저장 · +30P', DEMO_ACTIONS.DIET_SAVE, 'guest-demo-button guest-demo-button-primary');
    if (saved) action = '<p class="guest-demo-complete" role="status">예시 식단 저장 완료 · +30P</p>';

    return `
        <article class="guest-demo-card" data-example-record="true" data-guest-demo-coach-target>
            ${renderExampleBadge()}
            <h2>${model.title}</h2>
            <img src="${model.image}" alt="균형 잡힌 식단 예시 기록" loading="lazy" decoding="async">
            ${selected ? '<p>예시 사진이 선택됐어요.</p>' : '<p>실제 사진 대신 준비된 예시 사진으로 흐름을 체험해요.</p>'}
            ${aiViewed ? `<div class="guest-demo-ai-result"><strong>예시 AI 결과</strong><p>${model.aiResult}</p></div>` : ''}
            <div class="guest-demo-card-actions">
                ${action}
                ${renderLoginButton('내 사진으로 기록하기', 'select_real_file', 'diet', 'guest-demo-link-button')}
            </div>
        </article>`;
}

function renderExercise(session) {
    const model = GUEST_DEMO_MODELS.exercise;
    const reviewed = session.completedActions.includes(DEMO_ACTIONS.EXERCISE_REVIEW_SAMPLE);
    const saved = session.completedActions.includes(DEMO_ACTIONS.EXERCISE_SAVE);
    let action = renderButton('걸음·미디어 예시 확인', DEMO_ACTIONS.EXERCISE_REVIEW_SAMPLE);
    if (reviewed && !saved) action = renderButton('예시 저장 · +30P', DEMO_ACTIONS.EXERCISE_SAVE, 'guest-demo-button guest-demo-button-primary');
    if (saved) action = '<p class="guest-demo-complete" role="status">예시 운동 저장 완료 · +30P</p>';

    return `
        <article class="guest-demo-card" data-example-record="true" data-guest-demo-coach-target>
            ${renderExampleBadge()}
            <h2>${model.title}</h2>
            <img src="${model.image}" alt="운동 미디어 예시 기록" loading="lazy" decoding="async">
            <dl><div><dt>걸음</dt><dd>${model.stepsLabel}</dd></div><div><dt>운동</dt><dd>${model.durationLabel}</dd></div></dl>
            ${reviewed ? '<p>걸음과 운동 미디어가 한 기록으로 묶였어요.</p>' : ''}
            <div class="guest-demo-card-actions">
                ${action}
                ${renderLoginButton('내 운동 기록하기', 'open_camera', 'exercise', 'guest-demo-link-button')}
            </div>
        </article>`;
}

function renderSleep(session) {
    const model = GUEST_DEMO_MODELS.sleep;
    const reviewed = session.completedActions.includes(DEMO_ACTIONS.SLEEP_REVIEW_SAMPLE);
    const saved = session.completedActions.includes(DEMO_ACTIONS.SLEEP_SAVE);
    let action = renderButton('수면·명상 예시 확인', DEMO_ACTIONS.SLEEP_REVIEW_SAMPLE);
    if (reviewed && !saved) action = renderButton('예시 저장 · +20P', DEMO_ACTIONS.SLEEP_SAVE, 'guest-demo-button guest-demo-button-primary');
    if (saved) action = '<p class="guest-demo-complete" role="status">예시 마음 기록 저장 완료 · +20P</p>';

    return `
        <article class="guest-demo-card" data-example-record="true" data-guest-demo-coach-target>
            ${renderExampleBadge()}
            <h2>${model.title}</h2>
            <img src="${model.image}" alt="수면과 명상 예시 기록" loading="lazy" decoding="async">
            <dl><div><dt>수면</dt><dd>${model.sleepLabel}</dd></div><div><dt>마음 돌봄</dt><dd>${model.meditationLabel}</dd></div></dl>
            ${reviewed ? '<p>수면과 명상을 간단히 확인했어요.</p>' : ''}
            <div class="guest-demo-card-actions">
                ${action}
                ${renderLoginButton('내 마음 기록하기', 'save_real_record', 'sleep', 'guest-demo-link-button')}
            </div>
        </article>`;
}

function renderDashboard(session) {
    const points = getGuestDemoPoints(session);
    const progress = getGuestDemoCategoryProgress(session);
    const rows = [
        ['식단', progress.diet, 30],
        ['운동', progress.exercise, 30],
        ['마음', progress.sleep, 20]
    ].map(([label, complete, value]) => `
        <article class="guest-demo-card guest-demo-progress-card" data-example-record="true">
            ${renderExampleBadge()}
            <strong>${label}</strong>
            <span>${complete ? `완료 · +${value}P` : '아직 기록 전'}</span>
        </article>`).join('');

    return `
        <article class="guest-demo-card guest-demo-summary-card" data-example-record="true" data-guest-demo-coach-target>
            ${renderExampleBadge()}
            <p>체험 1일차</p>
            <h2>오늘 ${points.earned}P를 모았어요</h2>
            <p>현재 예시 포인트 ${points.total.toLocaleString('ko-KR')}P</p>
        </article>
        <div class="guest-demo-progress-grid">${rows}</div>
        <div class="guest-demo-primary-cta">${renderLoginButton('내 기록으로 시작하기', 'start_record', 'dashboard')}</div>`;
}

function renderAssets(session) {
    const points = getGuestDemoPoints(session);
    const reached = points.remaining === 0;
    return `
        <article class="guest-demo-card guest-demo-balance-card" data-example-record="true">
            ${renderExampleBadge()}
            <p>현재 예시 포인트</p>
            <h2>${points.total.toLocaleString('ko-KR')}P</h2>
            <p>체험에서 모은 포인트 +${points.earned}P</p>
        </article>
        <article class="guest-demo-card guest-demo-coupon-card" data-example-record="true" data-guest-demo-coach-target>
            ${renderExampleBadge()}
            <h2>첫 2,000P 커피 쿠폰</h2>
            <p>${reached ? '교환 가능한 포인트에 도달했어요.' : `${points.remaining}P만 더 모으면 도달해요.`}</p>
            <progress max="${GUEST_DEMO_POINTS.couponTarget}" value="${points.total}">${points.total}/${GUEST_DEMO_POINTS.couponTarget}</progress>
            ${renderLoginButton(reached ? '로그인하고 쿠폰 교환하기' : '로그인하고 포인트 모으기', reached ? 'redeem_coupon' : 'start_record', 'assets')}
        </article>
        <details class="guest-demo-advanced-assets">
            <summary>고급 자산 기능 보기</summary>
            <p>HBT 변환과 지갑 기능은 로그인 후 실제 자산 화면에서 사용할 수 있어요.</p>
            ${renderLoginButton('지갑 기능 확인', 'open_wallet', 'assets', 'guest-demo-link-button')}
        </details>`;
}

function normalizeUiState(value = {}) {
    const galleryFilter = ['all', 'diet', 'exercise', 'sleep'].includes(value.galleryFilter)
        ? value.galleryFilter
        : 'all';
    const selectedMediaId = GUEST_DEMO_MODELS.gallery.posts.some((post) => post.id === value.selectedMediaId)
        ? value.selectedMediaId
        : '';
    const allowedPostIds = new Set(GUEST_DEMO_MODELS.gallery.posts.map((post) => post.id));
    return {
        galleryFilter,
        selectedMediaId,
        reactedPostIds: uniqueAllowedStrings(value.reactedPostIds, allowedPostIds)
    };
}

export function createGuestDemoUiState() {
    return normalizeUiState();
}

export function renderGuestDemoTab(tab, session, options = {}) {
    const normalizedSession = normalizeGuestDemoSession(session) || createGuestDemoSession();
    const normalizedTab = normalizeDemoTab(tab, normalizedSession.activeTab);
    const uiState = normalizeUiState(options.uiState);
    const shouldShowCoach = options.showCoach === true && !normalizedSession.coachesDisabled;
    const content = {
        gallery: () => renderGallery(normalizedSession, uiState, options.activityStats),
        diet: () => renderDiet(normalizedSession),
        exercise: () => renderExercise(normalizedSession),
        sleep: () => renderSleep(normalizedSession),
        dashboard: () => renderDashboard(normalizedSession),
        assets: () => renderAssets(normalizedSession)
    }[normalizedTab]();

    return `
        <section class="guest-demo-surface${shouldShowCoach ? ' guest-demo-coach-active' : ''}" data-guest-demo-tab="${normalizedTab}" aria-label="HabitSchool 체험 모드">
            <div class="guest-demo-notice" role="status">
                <strong>체험 모드</strong>
                <span>모든 기록과 반응은 사용법을 위한 예시입니다</span>
            </div>
            ${shouldShowCoach ? renderCoach(normalizedTab) : ''}
            <div class="guest-demo-content">${content}</div>
        </section>`;
}

function createEmptyCallbacks(options) {
    return {
        onEvent: typeof options.onEvent === 'function' ? options.onEvent : () => {},
        onLoginIntent: typeof options.onLoginIntent === 'function' ? options.onLoginIntent : () => {},
        onTabChange: typeof options.onTabChange === 'function' ? options.onTabChange : () => {},
        onStateChange: typeof options.onStateChange === 'function' ? options.onStateChange : () => {},
        onRender: typeof options.onRender === 'function' ? options.onRender : () => {}
    };
}

function closestDataElement(target, selector) {
    if (!target || typeof target.closest !== 'function') return null;
    return target.closest(selector);
}

/**
 * Create a stateful adapter for app-core/index integration.
 *
 * The returned controller can work without a DOM root. When `mount(root)` is
 * used it installs one delegated click handler and renders into `root`.
 */
export function createGuestDemoController(options = {}) {
    const storage = options.storage === undefined ? getDefaultSessionStorage() : options.storage;
    const persistentStorage = options.persistentStorage === undefined
        ? getDefaultPersistentStorage()
        : options.persistentStorage;
    const callbacks = createEmptyCallbacks(options);
    let root = options.root || null;
    let session = null;
    let experienceState = APP_EXPERIENCE_STATES.SIGNED_OUT;
    let activityStats = null;
    let activeCoachTab = '';
    let uiState = createGuestDemoUiState();
    let mounted = false;

    function emit(name, payload = {}) {
        callbacks.onEvent(name, { ...payload });
    }

    function persist() {
        if (session) saveGuestDemoSession(session, storage);
    }

    function render() {
        if (!session) return '';
        const html = renderGuestDemoTab(session.activeTab, session, {
            activityStats,
            uiState,
            showCoach: activeCoachTab === session.activeTab
        });
        if (root && 'innerHTML' in root) root.innerHTML = html;
        callbacks.onRender({ tab: session.activeTab, html, session: { ...session } });
        return html;
    }

    function openTab(tab, meta = {}) {
        if (!session || experienceState !== APP_EXPERIENCE_STATES.GUEST_DEMO || !isDemoTab(tab)) {
            return false;
        }
        const visit = visitGuestDemoTab(session, tab);
        session = visit.session;
        activeCoachTab = visit.firstVisit && !session.coachesDisabled ? session.activeTab : '';
        persist();
        render();
        emit('guest_demo_tab_view', { tab: session.activeTab });
        callbacks.onTabChange({
            tab: session.activeTab,
            firstVisit: visit.firstVisit,
            source: String(meta.source || 'app')
        });
        return true;
    }

    function start(startOptions = {}) {
        removeLegacyGuestGalleryCache(persistentStorage);
        session = loadGuestDemoSession(storage) || createGuestDemoSession(startOptions.now);
        experienceState = APP_EXPERIENCE_STATES.GUEST_DEMO;
        const entryPoint = ENTRY_POINTS.has(startOptions.entryPoint) ? startOptions.entryPoint : 'unknown';
        callbacks.onStateChange(experienceState, { ...session });
        emit('guest_demo_start', { entryPoint });
        if (startOptions.deferOpenTab === true) {
            session = {
                ...session,
                activeTab: normalizeDemoTab(startOptions.tab || session.activeTab)
            };
            persist();
            return { ...session };
        }
        openTab(startOptions.tab || session.activeTab, { source: 'start' });
        return { ...session };
    }

    function restore() {
        const restored = loadGuestDemoSession(storage);
        if (!restored) return null;
        session = restored;
        experienceState = APP_EXPERIENCE_STATES.GUEST_DEMO;
        activeCoachTab = '';
        callbacks.onStateChange(experienceState, { ...session });
        render();
        return { ...session };
    }

    function completeAction(action, detail = {}) {
        if (!session || experienceState !== APP_EXPERIENCE_STATES.GUEST_DEMO) return null;
        if (resolveGuestDemoActionPolicy(action) !== 'local') return null;

        const result = applyGuestDemoAction(session, action);
        if (result.accepted) session = result.session;

        if (action === DEMO_ACTIONS.GALLERY_FILTER_ALL) uiState.galleryFilter = 'all';
        if (action === DEMO_ACTIONS.GALLERY_FILTER_DIET) uiState.galleryFilter = 'diet';
        if (action === DEMO_ACTIONS.GALLERY_FILTER_EXERCISE) uiState.galleryFilter = 'exercise';
        if (action === DEMO_ACTIONS.GALLERY_FILTER_SLEEP) uiState.galleryFilter = 'sleep';
        if (action === DEMO_ACTIONS.GALLERY_VIEW_MEDIA) {
            const candidate = String(detail.mediaId || '').trim();
            uiState.selectedMediaId = GUEST_DEMO_MODELS.gallery.posts.some((post) => post.id === candidate)
                ? candidate
                : '';
        }
        if (action === DEMO_ACTIONS.GALLERY_CLOSE_MEDIA) uiState.selectedMediaId = '';
        if (action === DEMO_ACTIONS.GALLERY_REACT) {
            const postId = String(detail.postId || '').trim();
            const allowed = GUEST_DEMO_MODELS.gallery.posts.some((post) => post.id === postId);
            if (allowed) {
                uiState.reactedPostIds = uiState.reactedPostIds.includes(postId)
                    ? uiState.reactedPostIds.filter((id) => id !== postId)
                    : [...uiState.reactedPostIds, postId];
            }
        }

        persist();
        render();
        emit('guest_demo_action', {
            tab: session.activeTab,
            action: String(action),
            success: result.accepted,
            outcome: result.alreadyCompleted ? 'already_complete' : (result.accepted ? 'complete' : 'prerequisite_missing')
        });
        return result;
    }

    function requestLogin(action = 'start_record', tab = session?.activeTab || 'gallery') {
        if (!session || experienceState !== APP_EXPERIENCE_STATES.GUEST_DEMO) return null;
        const intent = createPendingGuestIntent(tab, action);
        if (!intent) return null;
        session = { ...session, pendingIntent: intent };
        persist();
        emit('guest_demo_signup_click', { tab: intent.tab, action: intent.action });
        callbacks.onLoginIntent({ ...intent });
        return { ...intent };
    }

    function dismissCoach() {
        activeCoachTab = '';
        render();
    }

    function disableCoaches() {
        if (!session) return;
        session = disableGuestDemoCoaches(session);
        activeCoachTab = '';
        persist();
        render();
    }

    function finishAuthentication(success) {
        if (!session) return null;
        emit('auth_result', { success: success === true, source: 'guest_demo' });
        if (success !== true) {
            experienceState = APP_EXPERIENCE_STATES.GUEST_DEMO;
            callbacks.onStateChange(experienceState, { ...session });
            render();
            return null;
        }

        const pendingIntent = session.pendingIntent ? { ...session.pendingIntent } : null;
        clearGuestDemoSession(storage);
        session = null;
        activeCoachTab = '';
        uiState = createGuestDemoUiState();
        experienceState = APP_EXPERIENCE_STATES.AUTHENTICATED;
        if (root && 'innerHTML' in root) root.innerHTML = '';
        callbacks.onStateChange(experienceState, null);
        return pendingIntent;
    }

    function end() {
        clearGuestDemoSession(storage);
        session = null;
        activeCoachTab = '';
        uiState = createGuestDemoUiState();
        experienceState = APP_EXPERIENCE_STATES.SIGNED_OUT;
        if (root && 'innerHTML' in root) root.innerHTML = '';
        callbacks.onStateChange(experienceState, null);
    }

    function setActivityStats(value) {
        activityStats = normalizeGuestActivityStats(value);
        if (session?.activeTab === 'gallery') render();
    }

    function handleClick(event) {
        const commandElement = closestDataElement(event.target, '[data-guest-demo-command]');
        if (commandElement) {
            const command = commandElement.dataset?.guestDemoCommand;
            if (command === 'dismiss-coach') dismissCoach();
            if (command === 'disable-coaches') disableCoaches();
            return;
        }

        const loginElement = closestDataElement(event.target, '[data-guest-login-action]');
        if (loginElement) {
            requestLogin(loginElement.dataset?.guestLoginAction, loginElement.dataset?.guestLoginTab);
            return;
        }

        const actionElement = closestDataElement(event.target, '[data-guest-demo-action]');
        if (!actionElement) return;
        completeAction(actionElement.dataset?.guestDemoAction, {
            mediaId: actionElement.dataset?.demoMedia,
            postId: actionElement.dataset?.demoPost
        });
    }

    function mount(nextRoot = root) {
        if (!nextRoot || typeof nextRoot.addEventListener !== 'function') return false;
        if (mounted && root && typeof root.removeEventListener === 'function') {
            root.removeEventListener('click', handleClick);
        }
        root = nextRoot;
        root.addEventListener('click', handleClick);
        mounted = true;
        if (session) render();
        return true;
    }

    function destroy() {
        if (mounted && root && typeof root.removeEventListener === 'function') {
            root.removeEventListener('click', handleClick);
        }
        mounted = false;
        root = null;
    }

    return {
        start,
        restore,
        end,
        openTab,
        render,
        completeAction,
        requestLogin,
        dismissCoach,
        disableCoaches,
        finishAuthentication,
        setActivityStats,
        mount,
        destroy,
        getSession: () => (session ? { ...session } : null),
        getState: () => experienceState,
        getUiState: () => ({ ...uiState, reactedPostIds: [...uiState.reactedPostIds] })
    };
}
