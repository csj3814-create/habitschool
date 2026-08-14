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
    COUPON_REDEEM: 'coupon_redeemed',
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
    [DEMO_ACTIONS.GALLERY_REACT]: Object.freeze({ tab: 'gallery', requires: [], persist: false }),
    // 쿠폰 교환은 세 기록을 다 남겨 포인트가 목표에 닿아야 눌린다.
    // 순서를 건너뛰고 마지막만 눌러 보는 걸 막아, 실제 흐름을 그대로 겪게 한다.
    [DEMO_ACTIONS.COUPON_REDEEM]: Object.freeze({
        tab: 'assets',
        requires: [DEMO_ACTIONS.DIET_SAVE, DEMO_ACTIONS.EXERCISE_SAVE, DEMO_ACTIONS.SLEEP_SAVE]
    })
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
        author: '해빛 예시',
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

/**
 * 체험은 "둘러보기"보다 "한 바퀴 돌아보기"일 때 이해가 빠르다.
 * 기록 세 개를 남기고 → 내 기록에서 합계를 보고 → 갤러리에서 남들 것을 보고 →
 * 자산에서 쿠폰으로 바꾸는 흐름이 이 앱의 실제 사용 주기다.
 * 각 단계는 이미 있는 completedActions / visitedTabs로 판정한다.
 */
// hint 는 무엇을 하는지가 아니라 무엇을 누르는지 말한다. "저장까지 눌러 보세요" 보다
// "👆 표시된 버튼을 누르세요" 가 헤매지 않는다. 실제 버튼에도 같은 표시가 붙는다.
export const GUEST_DEMO_STEPS = Object.freeze([
    { id: 'diet', tab: 'diet', label: '식단 사진 등록하기', hint: '👆 표시된 버튼을 차례로 누르면 돼요. 사진 고르기 → AI 분석 → 저장.' },
    { id: 'exercise', tab: 'exercise', label: '운동 기록 남기기', hint: '👆 표시된 버튼을 누르세요. 예시 확인 후 저장까지 두 번이면 끝나요.' },
    { id: 'sleep', tab: 'sleep', label: '마음 기록 남기기', hint: '👆 표시된 버튼을 누르세요. 수면·명상 예시를 보고 저장하면 돼요.' },
    { id: 'dashboard', tab: 'dashboard', label: '내 기록 확인하기', hint: '이 화면을 보는 것만으로 끝나요. 방금 남긴 세 기록과 포인트가 모여 있어요.' },
    { id: 'gallery', tab: 'gallery', label: '갤러리 둘러보기', hint: '이 화면을 보는 것만으로 끝나요. 사진을 눌러 크게 보거나 ❤️ 를 눌러도 좋아요.' },
    { id: 'assets', tab: 'assets', label: '커피 쿠폰 교환하기', hint: '👆 표시된 교환 버튼을 누르면 마지막 단계예요.' }
]);

export function isGuestDemoStepDone(stepId, session) {
    const done = session?.completedActions || [];
    const visited = session?.visitedTabs || [];
    switch (stepId) {
        case 'diet': return done.includes(DEMO_ACTIONS.DIET_SAVE);
        case 'exercise': return done.includes(DEMO_ACTIONS.EXERCISE_SAVE);
        case 'sleep': return done.includes(DEMO_ACTIONS.SLEEP_SAVE);
        case 'dashboard': return visited.includes('dashboard');
        case 'gallery': return visited.includes('gallery');
        case 'assets': return done.includes(DEMO_ACTIONS.COUPON_REDEEM);
        default: return false;
    }
}

// 아직 못 한 첫 단계가 지금 할 일이다. 전부 마쳤으면 null.
export function getGuestDemoCurrentStep(session) {
    return GUEST_DEMO_STEPS.find((step) => !isGuestDemoStepDone(step.id, session)) || null;
}

export function getGuestDemoStepProgress(session) {
    const doneCount = GUEST_DEMO_STEPS.filter((step) => isGuestDemoStepDone(step.id, session)).length;
    return { done: doneCount, total: GUEST_DEMO_STEPS.length, complete: doneCount === GUEST_DEMO_STEPS.length };
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

function renderStepGuide(session, currentTab) {
    const progress = getGuestDemoStepProgress(session);
    const step = getGuestDemoCurrentStep(session);
    const pct = Math.round((progress.done / progress.total) * 100);

    if (progress.complete) {
        return `
            <div class="guest-demo-steps is-complete" role="status">
                <div class="guest-demo-steps-top">
                    <span class="guest-demo-steps-badge">🎉 완주</span>
                    <span class="guest-demo-steps-count">${progress.done}/${progress.total}</span>
                </div>
                <strong class="guest-demo-steps-title">한 바퀴 다 둘러봤어요</strong>
                <p class="guest-demo-steps-hint">기록하고 · 모으고 · 바꾸는 흐름이 실제 앱에서도 그대로예요.</p>
                <div class="guest-demo-steps-bar"><i style="width:100%"></i></div>
                ${renderLoginButton('내 기록으로 시작하기', 'start_record', 'dashboard')}
            </div>`;
    }

    const here = step.tab === currentTab;
    const jump = here
        ? ''
        : `<button type="button" class="guest-demo-steps-jump" data-guest-demo-goto="${step.tab}">${step.label} 하러 가기 →</button>`;

    return `
        <div class="guest-demo-steps${here ? ' is-here' : ''}" role="status" aria-label="체험 진행 안내">
            <div class="guest-demo-steps-top">
                <span class="guest-demo-steps-badge">${here ? '지금 해볼 것' : '다음 순서'}</span>
                <span class="guest-demo-steps-count">${progress.done}/${progress.total}</span>
            </div>
            <strong class="guest-demo-steps-title">${step.label}</strong>
            <p class="guest-demo-steps-hint">${step.hint}</p>
            <div class="guest-demo-steps-bar" role="progressbar" aria-valuenow="${progress.done}" aria-valuemin="0" aria-valuemax="${progress.total}">
                <i style="width:${pct}%"></i>
            </div>
            ${jump}
        </div>`;
}

function renderCoach(tab) {
    const copy = {
        gallery: ['다른 기록의 모습을 살펴보세요', '필터와 사진 확대, 반응을 체험할 수 있어요.'],
        diet: ['사진 한 장으로 식단을 기록해요', '예시 사진을 고르고 AI 설명을 확인한 뒤 저장해 보세요.'],
        exercise: ['걸음과 운동 미디어를 함께 기록해요', '8,400보 예시와 운동 미디어를 확인해 보세요.'],
        sleep: ['수면과 마음 돌봄을 간단히 남겨요', '수면과 5분 명상 예시를 확인해 보세요.'],
        dashboard: ['오늘 기록과 포인트를 한눈에 봐요', '체험에서 저장한 세 가지 기록이 바로 반영돼요.'],
        assets: ['기록하면 포인트가 쌓여요', '모은 포인트로 커피 쿠폰 같은 리워드를 교환할 수 있어요.']
    }[tab];
    if (!copy) return '';
    // 단계 안내가 무엇을 할지 이미 말해 주므로 닫기·끄기 버튼은 없앴다. 끌 것이 있어야
    // 끄는 버튼이 의미가 있는데, 지금은 이 문장이 방해가 아니라 설명이다.
    return `
        <aside class="guest-demo-coach" data-guest-demo-coach="${tab}" aria-label="${copy[0]}">
            <strong>${copy[0]}</strong>
            <p>${copy[1]}</p>
        </aside>`;
}

// 지금 눌러야 할 버튼 하나. 안내 문구로 "저장까지 눌러 보세요" 라고 말하는 것보다,
// 그 버튼 자체를 가리키는 편이 확실하다. 렌더 중에 이 값을 두고 버튼이 자기 차례인지 본다.
let _demoNextAction = null;

// 다음에 눌러야 할 행동을 고른다. 아직 못 한 것 중, 선행 조건이 이미 충족된 첫 번째.
export function getGuestDemoNextAction(session) {
    const done = new Set(session?.completedActions || []);
    for (const [action, definition] of Object.entries(ACTION_DEFINITIONS)) {
        if (definition.persist === false) continue;
        if (done.has(action)) continue;
        const requires = definition.requires || [];
        if (requires.every((required) => done.has(required))) return action;
    }
    return null;
}

function renderButton(label, action, className = 'guest-demo-button') {
    const isNext = action && action === _demoNextAction;
    const cls = isNext ? `${className} is-next-action` : className;
    // aria-current 로 스크린리더에게도 "지금 이것" 이라고 알린다.
    const current = isNext ? ' aria-current="step"' : '';
    // 손가락은 글자 왼쪽이 아니라 버튼 오른쪽 끝에 크게 둔다. 왼쪽에 작게 붙이면
    // 아이콘 장식으로 읽히고, 오른쪽에서 크게 흔들려야 "여길 누르라"로 읽힌다.
    const cue = isNext ? '<span class="guest-demo-next-cue" aria-hidden="true">👈</span>' : '';
    return `<button type="button" class="${cls}" data-guest-demo-action="${action}"${current}>${label}${cue}</button>`;
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
    // 체험 화면이 실제 갤러리와 너무 달라 보이면, 둘러본 사람이 실제 앱을 상상할 수
    // 없다. 그래서 전용 마크업 대신 실제 카드와 같은 클래스를 쓴다 — 스타일을 베껴
    // 두 벌로 관리하면 실제 갤러리를 고칠 때마다 체험 화면만 옛 모습으로 남는다.
    //
    // 실제 피드의 한 카드는 '한 사람의 하루'다. 식단·운동·마음을 각각 다른 사람의
    // 카드로 쪼개 놓으면 실제와 다른 인상을 준다. 세 기록을 한 카드에 모아
    // 사진 3장을 실제와 같은 3열로 보여 준다.
    const reactedAll = uiState.reactedPostIds.includes(model.posts[0]?.id);
    const heartCount = (model.posts[0]?.reactions || 0) + (reactedAll ? 1 : 0);
    const totalPoints = visiblePosts.reduce((sum, post) => sum + post.points, 0);
    const photosHtml = visiblePosts.map((post) => `
                    <button type="button" class="guest-demo-media-button" data-guest-demo-action="${DEMO_ACTIONS.GALLERY_VIEW_MEDIA}" data-demo-media="${post.id}" aria-label="${post.categoryLabel} 예시 사진 크게 보기">
                        <img src="${post.image}" alt="${post.categoryLabel} 예시 기록" loading="lazy" decoding="async">
                    </button>`).join('');
    const chipsHtml = visiblePosts.map((post) => `<span class="gallery-type-chip">${post.categoryLabel}</span>`).join('');
    const summaryHtml = visiblePosts.map((post) => post.summary).join(' · ');

    const postsHtml = visiblePosts.length === 0 ? '' : `
            <div class="gallery-card guest-demo-gallery-card" data-example-record="true">
                <div class="gallery-header">
                    <div class="gallery-avatar">${model.author.slice(0, 1)}</div>
                    <div class="gallery-header-info">
                        <div class="gallery-name-row">
                            <span class="gallery-name">${model.author}</span>
                            ${renderExampleBadge()}
                        </div>
                        <div class="gallery-status-row">
                            <span class="gallery-date">${model.dayLabel}</span>
                        </div>
                    </div>
                </div>
                <div class="gallery-post-meta">
                    <span class="gallery-point-badge">${totalPoints}P</span>
                    <div class="gallery-type-tags">${chipsHtml}</div>
                </div>
                <div class="gallery-photos">${photosHtml}</div>
                <p class="gallery-mind-text">${summaryHtml}</p>
                <div class="gallery-actions">
                    <button class="action-btn ${reactedAll ? 'active' : ''}" data-guest-demo-action="${DEMO_ACTIONS.GALLERY_REACT}" data-demo-post="${model.posts[0]?.id}" aria-pressed="${reactedAll}"><span class="action-icon">❤️</span><span class="action-label">좋아요</span><span class="action-count">${heartCount}</span></button>
                    <button class="action-btn" data-guest-login-action="react" data-guest-login-tab="gallery"><span class="action-icon">🔥</span><span class="action-label">격려</span></button>
                    <button class="action-btn" data-guest-login-action="react" data-guest-login-tab="gallery"><span class="action-icon">👏</span><span class="action-label">응원</span></button>
                    <button class="action-btn comment-btn" data-guest-login-action="post_comment" data-guest-login-tab="gallery"><span class="action-icon">💬</span><span class="action-label">댓글</span></button>
                </div>
            </div>`;

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
            ${renderButton('전체보기', DEMO_ACTIONS.GALLERY_FILTER_ALL)}
            ${renderButton('🥗 식단', DEMO_ACTIONS.GALLERY_FILTER_DIET)}
            ${renderButton('🏃 운동', DEMO_ACTIONS.GALLERY_FILTER_EXERCISE)}
            ${renderButton('🧘 마음', DEMO_ACTIONS.GALLERY_FILTER_SLEEP)}
        </nav>
        <div class="guest-demo-gallery-feed">${postsHtml}</div>
        ${lightboxHtml}
        <div class="guest-demo-primary-cta">${renderLoginButton('내 기록으로 시작하기', 'start_record', 'dashboard')}</div>`;
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

// 쿠폰 그림은 인라인 SVG로 그린다.
// 데모 이미지는 로컬 webp 세 개만 허용하는 규칙(isAllowedGuestDemoImage)이 있는데,
// 그건 체험 화면이 임의의 원격 이미지를 불러오지 못하게 하려는 것이다.
// 파일을 하나 더 늘려 그 규칙을 느슨하게 만드는 대신, 마크업으로 직접 그린다.
function renderCoffeeCouponArt() {
    return `
        <svg class="guest-demo-coupon-image" viewBox="0 0 320 150" role="img" aria-label="예시 커피 쿠폰">
            <rect x="1" y="1" width="318" height="148" rx="16" fill="#FFF6E5" stroke="#E8C89A" stroke-width="2"/>
            <line x1="196" y1="14" x2="196" y2="136" stroke="#E0BE8C" stroke-width="2" stroke-dasharray="6 7" stroke-linecap="round"/>
            <circle cx="196" cy="1" r="9" fill="#FFFDF7"/>
            <circle cx="196" cy="149" r="9" fill="#FFFDF7"/>
            <g transform="translate(48 30)">
                <ellipse cx="46" cy="84" rx="40" ry="6" fill="#E4CFB2" opacity="0.5"/>
                <path d="M12 26h68v32a26 26 0 0 1-26 26H38a26 26 0 0 1-26-26z" fill="#FFFFFF" stroke="#C9A87C" stroke-width="2.5" stroke-linejoin="round"/>
                <path d="M80 33h9a13 13 0 0 1 0 26h-9" fill="none" stroke="#C9A87C" stroke-width="2.5" stroke-linecap="round"/>
                <path d="M12 26h68v8a8 8 0 0 1-8 8H20a8 8 0 0 1-8-8z" fill="#6F4B2E"/>
                <path d="M32 14c0-6 6-6 6-12" fill="none" stroke="#C9A87C" stroke-width="2.5" stroke-linecap="round" opacity="0.7"/>
                <path d="M46 12c0-7 6-7 6-14" fill="none" stroke="#C9A87C" stroke-width="2.5" stroke-linecap="round" opacity="0.55"/>
                <path d="M60 14c0-6 6-6 6-12" fill="none" stroke="#C9A87C" stroke-width="2.5" stroke-linecap="round" opacity="0.7"/>
            </g>
            <text x="222" y="50" font-size="13" font-weight="800" fill="#8A6336">아메리카노</text>
            <text x="222" y="74" font-size="21" font-weight="900" fill="#B35A00">2,000P</text>
            <rect x="222" y="88" width="70" height="21" rx="10" fill="#FFE3BE" stroke="#E8C89A"/>
            <text x="257" y="103" text-anchor="middle" font-size="11" font-weight="800" fill="#8A6336">예시 쿠폰</text>
            <text x="222" y="126" font-size="10" fill="#A08767">교환은 로그인 후</text>
        </svg>`;
}

function renderAssets(session) {
    const points = getGuestDemoPoints(session);
    const reached = points.remaining === 0;
    const redeemed = session.completedActions.includes(DEMO_ACTIONS.COUPON_REDEEM);
    // 체험에는 HBT(온체인 토큰)를 싣지 않는다. 구글플레이는 앱 안의 암호화폐 표현을
    // 별도로 심사하는데, 로그인도 하지 않은 첫 화면에서 토큰부터 보여 줄 이유가 없다.
    // 로그인 뒤 자산 탭에는 그대로 있다.
    return `
        <article class="guest-demo-card guest-demo-balance-card" data-example-record="true">
            ${renderExampleBadge()}
            <h2>예시 포인트</h2>
            <div class="guest-demo-asset-grid">
                <div><span>모은 포인트</span><strong>${points.total.toLocaleString('ko-KR')}P</strong></div>
            </div>
            <p>기록할 때마다 포인트가 쌓이고, 모인 포인트로 쿠폰을 교환해요.</p>
        </article>
        <article class="guest-demo-card guest-demo-coupon-card" data-example-record="true" data-guest-demo-coach-target>
            ${renderExampleBadge()}
            <h2>첫 ${GUEST_DEMO_POINTS.couponTarget.toLocaleString('ko-KR')}P 커피 쿠폰</h2>
            ${renderCoffeeCouponArt()}
            ${redeemed
                ? `<p class="guest-demo-complete" role="status">예시 쿠폰 교환 완료 · 실제 교환은 로그인 후에 할 수 있어요</p>
                   ${renderLoginButton('로그인하고 진짜 쿠폰 받기', 'redeem_coupon', 'assets')}`
                : `<p>${reached ? '교환 가능한 포인트에 도달했어요.' : `${points.remaining}P만 더 모으면 도달해요.`}</p>
                   <progress max="${GUEST_DEMO_POINTS.couponTarget}" value="${points.total}">${points.total}/${GUEST_DEMO_POINTS.couponTarget}</progress>
                   ${reached
                        ? renderButton('쿠폰 교환하기', DEMO_ACTIONS.COUPON_REDEEM, 'guest-demo-button guest-demo-button-primary')
                        : renderLoginButton('로그인하고 포인트 모으기', 'start_record', 'assets')}`}
        </article>
        <!--
          위 숫자는 쿠폰에 닿는 순간을 보여 주려고 미리 채워 둔 예시다.
          실제 가입 보너스는 200P이므로(functions/runtime.js welcome bonus),
          체험 숫자를 실제로 받는 금액으로 오해하지 않도록 여기서 분명히 적는다.
        -->
        <p class="guest-demo-real-bonus-note">위 포인트는 사용법을 보여주기 위한 예시예요. 실제로 가입하면 <strong>200P</strong>로 시작합니다.</p>`;
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
    // 이번 렌더에서 어떤 버튼이 '지금 누를 것'인지 정해 둔다. renderButton 이 읽는다.
    _demoNextAction = getGuestDemoNextAction(normalizedSession);
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
            ${renderStepGuide(normalizedSession, normalizedTab)}
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
        if (String(meta.source || 'app') !== 'restore') {
            emit('guest_demo_tab_view', { tab: session.activeTab });
        }
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

        // 단계 안내의 "하러 가기" — 다음 순서 탭으로 데려다 준다.
        //
        // 앱의 openTab 을 거쳐야 한다. 상단 탭 버튼의 활성 표시와 밑줄은 그쪽에서만
        // 바뀌기 때문에, 여기서 내부 openTab 만 부르면 화면은 운동 탭인데 위쪽 표시는
        // 식단에 머무는 상태가 된다.
        const gotoElement = closestDataElement(event.target, '[data-guest-demo-goto]');
        if (gotoElement) {
            const target = gotoElement.dataset?.guestDemoGoto;
            if (typeof window !== 'undefined' && typeof window.openTab === 'function') {
                window.openTab(target);
            } else {
                openTab(target, { source: 'step-guide' });
            }
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
