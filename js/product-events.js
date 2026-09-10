/**
 * Privacy-minimized GA product events.
 *
 * Every accepted parameter is an enumerated product dimension. Free-form text,
 * identifiers, URLs, health values, journal content, and exact dates are never
 * forwarded. Keep this module dependency-free so browser ESM and Vitest can
 * import the same implementation.
 */

export const PRODUCT_EVENT_NAMES = Object.freeze([
    'guest_demo_start',
    'guest_demo_tab_view',
    'guest_demo_action',
    'guest_demo_signup_click',
    'auth_result',
    'resume_intent_result',
    'first_record_start',
    'record_saved',
    'first_reward_view',
    'day3_activated',
    'week2_return',
    'share_card_sent',
    'invite_link_landing',
    'share_prompt_shown',
    'onboarding_gate',
    'auth_start',
    'auth_consent_blocked',
    'auth_browser_blocked'
]);

const freezeValues = (values) => Object.freeze([...values]);
const KST_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
});

export function getKstDateKey(value) {
    if (value == null || value === '') return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const parts = Object.fromEntries(KST_DATE_FORMATTER.formatToParts(date)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]));
    return parts.year && parts.month && parts.day
        ? `${parts.year}-${parts.month}-${parts.day}`
        : '';
}

function dateKeyOrdinal(dateKey = '') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey))) return NaN;
    const [year, month, day] = String(dateKey).split('-').map(Number);
    return Date.UTC(year, month - 1, day) / 86400000;
}

export function getKstAccountDay(createdAt, now = new Date()) {
    const createdKey = getKstDateKey(createdAt);
    const nowKey = getKstDateKey(now);
    const createdOrdinal = dateKeyOrdinal(createdKey);
    const nowOrdinal = dateKeyOrdinal(nowKey);
    if (!Number.isFinite(createdOrdinal) || !Number.isFinite(nowOrdinal)) return null;
    const accountDay = nowOrdinal - createdOrdinal + 1;
    return accountDay >= 1 ? accountDay : null;
}

export function getRecordCountBucket(count = 0) {
    const normalized = Math.max(0, Math.floor(Number(count) || 0));
    if (normalized === 0) return 'zero';
    if (normalized === 1) return 'one';
    if (normalized === 2) return 'two';
    if (normalized === 3) return 'three';
    return 'four_plus';
}

export function resolveActivationMilestone({ createdAt, now = new Date(), activeDayCount = 0 } = {}) {
    const accountDay = getKstAccountDay(createdAt, now);
    if (!accountDay) return null;
    const normalizedActiveDays = Math.max(0, Math.floor(Number(activeDayCount) || 0));
    const recordCountBucket = getRecordCountBucket(normalizedActiveDays);
    if (accountDay <= 3 && normalizedActiveDays >= 2) {
        return { eventName: 'day3_activated', recordCountBucket, accountDay };
    }
    if (accountDay >= 8 && accountDay <= 14) {
        return { eventName: 'week2_return', recordCountBucket, accountDay };
    }
    return null;
}

export const PRODUCT_EVENT_VALUE_ALLOWLISTS = Object.freeze({
    tab: freezeValues(['dashboard', 'diet', 'exercise', 'sleep', 'profile', 'gallery', 'assets']),
    action: freezeValues([
        'change_tab',
        'open_media',
        'play_video',
        'expand_comments',
        'scroll_feed',
        'retry',
        'continue',
        'back',
        'close',
        'open_privacy',
        'change_privacy'
    ]),
    entry_point: freezeValues([
        'landing',
        'login_modal',
        'guest_welcome',
        'gallery_header',
        'gallery_feed',
        'gallery_sticky',
        'feed_card',
        'empty_state',
        'record_prompt',
        'reward_prompt',
        'resume_prompt',
        'notification',
        'onboarding',
        'direct',
        'share_card',
        'share_modal',
        'invite_link'
    ]),
    // 공유가 실제로 어느 경로로 나갔는지. 어떤 경로가 실제 유입을 만드는지 봐야
    // 다음 개선(카드 성취 수치, 초대 보상, 동적 OG)의 효과를 전후로 비교할 수 있다.
    share_method: freezeValues([
        'web_share_files',
        'web_share_text',
        'platform_modal',
        'clipboard',
        'download',
        'unavailable'
    ]),
    status: freezeValues(['success', 'cancelled', 'error', 'skipped', 'unavailable', 'empty', 'expired', 'deferred']),
    // 팝업이냐 리디렉트냐. 브라우저마다 다른 경로를 타고, 2026-09-07 기준
    // 삼성 인터넷과 안드로이드 웨일만 리디렉트다. 어느 경로가 실제로
    // 끝나는지를 보려면 결과와 함께 이 값이 있어야 한다.
    login_mode: freezeValues(['popup', 'redirect']),
    // 온보딩 게이트가 어느 갈래로 갔나. shown 의 분모는 그날의 신규 가입이고,
    // legacy_account 가 크면 게이트가 또 잘못 닫히고 있다는 뜻이다.
    onboarding_state: freezeValues([
        'shown',
        'has_habit',
        'already_recording',
        'legacy_account'
    ]),
    variant: freezeValues(['control', 'demo_v1', 'demo_v2', 'personalized_v1', 'full']),
    locale: freezeValues(['ko', 'en']),
    app_mode: freezeValues(['default', 'simple', 'pwa']),
    position_bucket: freezeValues(['top', 'middle', 'bottom', 'first', 'second', 'third_or_later']),
    item_count_bucket: freezeValues(['zero', 'one', 'two_to_three', 'four_to_ten', 'eleven_plus']),
    duration_bucket: freezeValues(['under_1s', 'one_to_three_s', 'three_to_six_s', 'over_6s']),
    record_count_bucket: freezeValues(['zero', 'one', 'two', 'three', 'four_plus']),
    data_source: freezeValues(['memory_cache', 'persistent_cache', 'rest', 'firestore', 'none']),
    auth_method: freezeValues(['google']),
    intent: freezeValues(['record', 'reward', 'gallery', 'install']),
    error_kind: freezeValues([
        'network',
        'timeout',
        'popup_blocked',
        'user_cancelled',
        'permission_denied',
        'invalid_state',
        'unknown'
    ])
});

const schema = (definition) => Object.freeze(definition);
const values = PRODUCT_EVENT_VALUE_ALLOWLISTS;

export const PRODUCT_EVENT_PARAM_ALLOWLIST = Object.freeze({
    guest_demo_start: schema({
        entry_point: values.entry_point,
        variant: values.variant,
        locale: values.locale,
        app_mode: values.app_mode
    }),
    guest_demo_tab_view: schema({
        tab: values.tab,
        variant: values.variant,
        position_bucket: values.position_bucket
    }),
    guest_demo_action: schema({
        tab: values.tab,
        action: values.action,
        entry_point: values.entry_point,
        position_bucket: values.position_bucket,
        item_count_bucket: values.item_count_bucket,
        data_source: values.data_source,
        variant: values.variant
    }),
    guest_demo_signup_click: schema({
        tab: values.tab,
        entry_point: values.entry_point,
        position_bucket: values.position_bucket,
        variant: values.variant
    }),
    // 게스트 데모뿐 아니라 일반 로그인 경로에서도 발생한다(2026-09-07~).
    auth_result: schema({
        login_mode: values.login_mode,
        status: values.status,
        auth_method: values.auth_method,
        entry_point: values.entry_point,
        duration_bucket: values.duration_bucket,
        error_kind: values.error_kind,
        variant: values.variant
    }),
    resume_intent_result: schema({
        intent: values.intent,
        status: values.status,
        entry_point: values.entry_point,
        error_kind: values.error_kind,
        variant: values.variant
    }),
    first_record_start: schema({
        tab: values.tab,
        entry_point: values.entry_point,
        variant: values.variant
    }),
    record_saved: schema({
        tab: values.tab,
        status: values.status,
        entry_point: values.entry_point,
        duration_bucket: values.duration_bucket,
        error_kind: values.error_kind,
        variant: values.variant
    }),
    first_reward_view: schema({
        entry_point: values.entry_point,
        variant: values.variant
    }),
    day3_activated: schema({
        entry_point: values.entry_point,
        record_count_bucket: values.record_count_bucket,
        variant: values.variant
    }),
    week2_return: schema({
        entry_point: values.entry_point,
        record_count_bucket: values.record_count_bucket,
        variant: values.variant
    }),
    share_card_sent: schema({
        share_method: values.share_method,
        status: values.status,
        entry_point: values.entry_point,
        locale: values.locale,
        app_mode: values.app_mode,
        variant: values.variant
    }),
    // status로 로그인 상태를 구분한다. success = 이미 회원, empty = 아직 비회원.
    invite_link_landing: schema({
        status: values.status,
        entry_point: values.entry_point,
        locale: values.locale,
        app_mode: values.app_mode
    }),
    // 저장 직후 공유 유도가 실제로 노출된 횟수. 전환율의 분모가 된다.
    // 분자는 entry_point가 record_prompt인 share_card_sent다.
    share_prompt_shown: schema({
        tab: values.tab,
        entry_point: values.entry_point,
        locale: values.locale,
        app_mode: values.app_mode
    }),
    // 온보딩 모달을 띄웠는지/왜 안 띄웠는지. 이게 없어서 2026-09-07 진단은
    // users 문서의 뺄셈으로만 "390명이 모달을 못 봤다"에 도달할 수 있었다.
    onboarding_gate: schema({
        onboarding_state: values.onboarding_state,
        locale: values.locale,
        app_mode: values.app_mode
    }),
    // 로그인 버튼을 실제로 누른 시점. auth_result 의 분모다.
    //
    // 2026-09-07 까지 일반 로그인 경로에는 계측이 아예 없었다. auth_result 는
    // 게스트 데모에서만 발생해(js/guest-demo.js) 로그인 성공·실패·이탈을
    // 아무도 볼 수 없었다. auth_start 를 세고 auth_result 를 빼면
    // **구글에 갔다가 돌아오지 않은 사람**이 남는다 — 그게 지금까지
    // 어떤 지표에도 안 잡히던 손실이다.
    auth_start: schema({
        login_mode: values.login_mode,
        entry_point: values.entry_point,
        locale: values.locale,
        app_mode: values.app_mode
    }),
    // 필수 동의를 안 한 채로 시작 버튼을 누른 경우. auth_start 의 앞단이라
    // 이걸 세지 않으면 동의에서 막혀 나간 사람은 어떤 지표에도 안 남는다.
    auth_consent_blocked: schema({
        entry_point: values.entry_point,
        locale: values.locale,
        app_mode: values.app_mode
    }),

    // 인앱 브라우저로 분류돼 로그인 버튼이 아예 사라진 경우.
    // 2026-09-08 에 웨일이 여기 걸려 135명이 한 명도 기록에 닿지 못했는데,
    // 계측이 없어서 GA 로는 "가입 클릭은 있고 기록은 0" 으로만 보였다.
    // 브라우저 구분은 GA 기본 차원에 이미 있으므로 여기서는 아무것도 싣지 않는다.
    auth_browser_blocked: schema({
        locale: values.locale,
        app_mode: values.app_mode
    })
});

const EVENT_NAME_SET = new Set(PRODUCT_EVENT_NAMES);
const sentDedupeKeys = new Set();

function getRuntime() {
    return typeof globalThis === 'undefined' ? {} : globalThis;
}

function isConsentDenied(consent) {
    if (consent === false || consent === 0) return true;
    if (typeof consent === 'string') {
        return ['denied', 'false', '0', 'off'].includes(consent.trim().toLowerCase());
    }
    if (consent && typeof consent === 'object') {
        return consent.analytics === false
            || String(consent.analytics_storage || '').trim().toLowerCase() === 'denied';
    }
    return false;
}

/**
 * Returns false only for an explicit analytics denial. An absent marker keeps
 * compatibility with the app's existing GA setup; callers can pass consent or
 * set globalThis.__HABITSCHOOL_ANALYTICS_CONSENT__.
 */
export function hasProductAnalyticsConsent(options = {}) {
    const hasExplicitConsent = Object.prototype.hasOwnProperty.call(options, 'consent');
    const consent = hasExplicitConsent
        ? options.consent
        : getRuntime().__HABITSCHOOL_ANALYTICS_CONSENT__;
    return !isConsentDenied(consent);
}

/**
 * Picks only event-specific enum values. Unknown keys, non-string values, and
 * enum misses are dropped rather than coerced.
 */
export function sanitizeProductEventParams(eventName, rawParams = {}) {
    const eventSchema = PRODUCT_EVENT_PARAM_ALLOWLIST[eventName];
    if (!eventSchema || !rawParams || typeof rawParams !== 'object' || Array.isArray(rawParams)) {
        return {};
    }

    const safeParams = {};
    Object.entries(eventSchema).forEach(([key, allowedValues]) => {
        const rawValue = rawParams[key];
        if (typeof rawValue !== 'string') return;
        const value = rawValue.trim();
        if (allowedValues.includes(value)) safeParams[key] = value;
    });
    return safeParams;
}

export function buildProductEvent(eventName, rawParams = {}) {
    if (!EVENT_NAME_SET.has(eventName)) return null;
    return {
        name: eventName,
        params: sanitizeProductEventParams(eventName, rawParams)
    };
}

function hashDedupeKey(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function resolveDedupeKey(event, options) {
    const customKey = typeof options.dedupeKey === 'string' ? options.dedupeKey.trim() : '';
    if (customKey) {
        // Hash local-only custom keys so even the in-memory set does not retain
        // an accidentally supplied identifier. The key is never sent to GA.
        return `${event.name}:custom:${hashDedupeKey(customKey)}`;
    }
    if (options.dedupe === true || options.once === true) {
        return `${event.name}:payload:${JSON.stringify(event.params)}`;
    }
    return '';
}

/** Clears page-lifetime duplicate state; primarily useful in tests. */
export function resetProductEventDedupe() {
    sentDedupeKeys.clear();
}

/**
 * Sends a sanitized GA event and returns whether it was handed to gtag.
 * Missing gtag, explicit consent denial, invalid events, duplicates, and gtag
 * exceptions all return false without throwing.
 */
export function trackProductEvent(eventName, rawParams = {}, options = {}) {
    const event = buildProductEvent(eventName, rawParams);
    if (!event || !hasProductAnalyticsConsent(options)) return false;

    const hasExplicitGtag = Object.prototype.hasOwnProperty.call(options, 'gtag');
    const gtag = hasExplicitGtag ? options.gtag : getRuntime().gtag;
    if (typeof gtag !== 'function') return false;

    const dedupeKey = resolveDedupeKey(event, options);
    if (dedupeKey && sentDedupeKeys.has(dedupeKey)) return false;

    try {
        gtag('event', event.name, event.params);
        if (dedupeKey) sentDedupeKeys.add(dedupeKey);
        return true;
    } catch (_) {
        return false;
    }
}

export default Object.freeze({
    eventNames: PRODUCT_EVENT_NAMES,
    paramAllowlist: PRODUCT_EVENT_PARAM_ALLOWLIST,
    sanitize: sanitizeProductEventParams,
    build: buildProductEvent,
    track: trackProductEvent,
    resetDedupe: resetProductEventDedupe
});
