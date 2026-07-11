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
    'week2_return'
]);

const freezeValues = (values) => Object.freeze([...values]);

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
        'direct'
    ]),
    status: freezeValues(['success', 'cancelled', 'error', 'skipped', 'unavailable', 'empty', 'expired', 'deferred']),
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
    auth_result: schema({
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
