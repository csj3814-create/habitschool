import { afterEach, describe, expect, it, vi } from 'vitest';

import productEvents, {
    PRODUCT_EVENT_NAMES,
    PRODUCT_EVENT_PARAM_ALLOWLIST,
    buildProductEvent,
    getKstAccountDay,
    getKstDateKey,
    getRecordCountBucket,
    hasProductAnalyticsConsent,
    resetProductEventDedupe,
    resolveActivationMilestone,
    sanitizeProductEventParams,
    trackProductEvent
} from '../js/product-events.js';

const EXPECTED_EVENT_NAMES = [
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
];

afterEach(() => {
    resetProductEventDedupe();
    delete globalThis.__HABITSCHOOL_ANALYTICS_CONSENT__;
});

describe('product event schema', () => {
    it('exposes exactly the eleven approved event names', () => {
        expect(PRODUCT_EVENT_NAMES).toEqual(EXPECTED_EVENT_NAMES);
        expect(Object.keys(PRODUCT_EVENT_PARAM_ALLOWLIST)).toEqual(EXPECTED_EVENT_NAMES);
        expect(Object.isFrozen(PRODUCT_EVENT_NAMES)).toBe(true);
    });

    it('supports named and default ESM imports', () => {
        expect(productEvents.eventNames).toBe(PRODUCT_EVENT_NAMES);
        expect(productEvents.track).toBe(trackProductEvent);
        expect(productEvents.sanitize).toBe(sanitizeProductEventParams);
    });

    it('builds approved events and rejects unknown names', () => {
        expect(buildProductEvent('guest_demo_tab_view', { tab: 'gallery', variant: 'demo_v1' })).toEqual({
            name: 'guest_demo_tab_view',
            params: { tab: 'gallery', variant: 'demo_v1' }
        });
        expect(buildProductEvent('arbitrary_event', { tab: 'gallery' })).toBeNull();
    });
});

describe('activation milestone resolution', () => {
    const createdAt = '2026-07-01T00:00:00.000Z';

    it('calculates account days from KST calendar boundaries', () => {
        expect(getKstDateKey('2026-07-18T14:59:59.000Z')).toBe('2026-07-18');
        expect(getKstDateKey('2026-07-18T15:00:00.000Z')).toBe('2026-07-19');
        expect(getKstAccountDay('2026-07-18T14:59:59.000Z', '2026-07-18T15:00:00.000Z')).toBe(2);
        expect(getKstAccountDay(null, '2026-07-18T15:00:00.000Z')).toBeNull();
    });

    it('emits day3 only after two active dates within account days one through three', () => {
        expect(resolveActivationMilestone({ createdAt, now: '2026-07-01T12:00:00.000Z', activeDayCount: 1 })).toBeNull();
        expect(resolveActivationMilestone({ createdAt, now: '2026-07-03T12:00:00.000Z', activeDayCount: 2 })).toEqual({
            eventName: 'day3_activated',
            recordCountBucket: 'two',
            accountDay: 3
        });
        expect(resolveActivationMilestone({ createdAt, now: '2026-07-04T12:00:00.000Z', activeDayCount: 2 })).toBeNull();
    });

    it('emits week2 return only on account days eight through fourteen', () => {
        expect(resolveActivationMilestone({ createdAt, now: '2026-07-07T12:00:00.000Z', activeDayCount: 3 })).toBeNull();
        expect(resolveActivationMilestone({ createdAt, now: '2026-07-08T12:00:00.000Z', activeDayCount: 3 })).toEqual({
            eventName: 'week2_return',
            recordCountBucket: 'three',
            accountDay: 8
        });
        expect(resolveActivationMilestone({ createdAt, now: '2026-07-14T12:00:00.000Z', activeDayCount: 5 })).toEqual({
            eventName: 'week2_return',
            recordCountBucket: 'four_plus',
            accountDay: 14
        });
        expect(resolveActivationMilestone({ createdAt, now: '2026-07-15T12:00:00.000Z', activeDayCount: 5 })).toBeNull();
    });

    it('uses only the approved record-count buckets', () => {
        expect([0, 1, 2, 3, 4, 40].map(getRecordCountBucket)).toEqual([
            'zero', 'one', 'two', 'three', 'four_plus', 'four_plus'
        ]);
    });

    it('keeps identifiers, dates, and health values out of activation payloads', () => {
        expect(sanitizeProductEventParams('day3_activated', {
            entry_point: 'record_prompt',
            record_count_bucket: 'two',
            variant: 'full',
            uid: 'user-123',
            date: '2026-07-03',
            weight: 72.4,
            glucose: 105,
            journal: 'private health content'
        })).toEqual({
            entry_point: 'record_prompt',
            record_count_bucket: 'two',
            variant: 'full'
        });
    });
});

describe('privacy-minimized parameter sanitizing', () => {
    it('keeps only event-specific enumerated dimensions', () => {
        const result = sanitizeProductEventParams('guest_demo_action', {
            tab: 'gallery',
            action: 'open_media',
            entry_point: 'gallery_feed',
            position_bucket: 'top',
            item_count_bucket: 'four_to_ten',
            data_source: 'rest',
            variant: 'demo_v1',
            status: 'success',
            arbitrary: 'do not forward'
        });

        expect(result).toEqual({
            tab: 'gallery',
            action: 'open_media',
            entry_point: 'gallery_feed',
            position_bucket: 'top',
            item_count_bucket: 'four_to_ten',
            data_source: 'rest',
            variant: 'demo_v1'
        });
    });

    it('drops identifiers, contact data, URLs, health values, content, and exact dates', () => {
        const result = sanitizeProductEventParams('record_saved', {
            tab: 'diet',
            status: 'success',
            duration_bucket: 'one_to_three_s',
            variant: 'demo_v1',
            uid: 'user-123',
            user_id: 'user-123',
            user_name: '홍길동',
            email: 'person@example.com',
            phone: '010-1234-5678',
            photo_url: 'https://firebasestorage.googleapis.com/private.jpg',
            weight: 71.2,
            glucose: 98,
            blood_pressure: '120/80',
            steps: 10321,
            gratitude: '개인적인 일기',
            comment: '개인 댓글',
            exact_date: '2026-07-10',
            timestamp: 1783612800000
        });

        expect(result).toEqual({
            tab: 'diet',
            status: 'success',
            duration_bucket: 'one_to_three_s',
            variant: 'demo_v1'
        });
    });

    it('drops non-enum values even when the parameter key is approved', () => {
        expect(sanitizeProductEventParams('auth_result', {
            status: 'signed-in-as-user-123',
            auth_method: 'person@example.com',
            entry_point: 'https://example.com/private',
            duration_bucket: 1234,
            error_kind: 'raw Firebase error message',
            variant: 'experiment-user-123'
        })).toEqual({});
    });

    it('accepts the privacy-safe personalized notification entry dimensions', () => {
        expect(sanitizeProductEventParams('first_record_start', {
            tab: 'exercise',
            entry_point: 'notification',
            variant: 'personalized_v1',
            exact_time: '20:00'
        })).toEqual({
            tab: 'exercise',
            entry_point: 'notification',
            variant: 'personalized_v1'
        });
    });

    it('attributes a saved record to a notification without accepting timestamps', () => {
        expect(sanitizeProductEventParams('record_saved', {
            tab: 'sleep',
            status: 'success',
            entry_point: 'notification',
            variant: 'personalized_v1',
            opened_at: '2026-07-11T10:00:00+09:00'
        })).toEqual({
            tab: 'sleep',
            status: 'success',
            entry_point: 'notification',
            variant: 'personalized_v1'
        });
    });

    it('returns an empty object for malformed payloads', () => {
        expect(sanitizeProductEventParams('guest_demo_start', null)).toEqual({});
        expect(sanitizeProductEventParams('guest_demo_start', [])).toEqual({});
        expect(sanitizeProductEventParams('unknown', { locale: 'ko' })).toEqual({});
    });
});

describe('safe GA dispatch', () => {
    it('dispatches only the sanitized payload to gtag', () => {
        const gtag = vi.fn();

        expect(trackProductEvent('auth_result', {
            status: 'success',
            auth_method: 'google',
            entry_point: 'login_modal',
            email: 'person@example.com',
            uid: 'user-123'
        }, { gtag })).toBe(true);

        expect(gtag).toHaveBeenCalledOnce();
        expect(gtag).toHaveBeenCalledWith('event', 'auth_result', {
            status: 'success',
            auth_method: 'google',
            entry_point: 'login_modal'
        });
    });

    it('is a safe no-op when gtag is missing or the event name is invalid', () => {
        expect(() => trackProductEvent('guest_demo_start', { locale: 'ko' }, { gtag: null })).not.toThrow();
        expect(trackProductEvent('guest_demo_start', { locale: 'ko' }, { gtag: null })).toBe(false);
        expect(trackProductEvent('not_approved', {}, { gtag: vi.fn() })).toBe(false);
    });

    it('honors explicit and global analytics consent denial', () => {
        const gtag = vi.fn();

        expect(hasProductAnalyticsConsent({ consent: 'denied' })).toBe(false);
        expect(trackProductEvent('guest_demo_start', { locale: 'ko' }, { gtag, consent: false })).toBe(false);

        globalThis.__HABITSCHOOL_ANALYTICS_CONSENT__ = { analytics_storage: 'denied' };
        expect(hasProductAnalyticsConsent()).toBe(false);
        expect(trackProductEvent('guest_demo_start', { locale: 'ko' }, { gtag })).toBe(false);
        expect(gtag).not.toHaveBeenCalled();
    });

    it('swallows gtag errors and allows a later retry', () => {
        const failingGtag = vi.fn(() => { throw new Error('blocked'); });
        const workingGtag = vi.fn();
        const params = { entry_point: 'landing', variant: 'demo_v1' };

        expect(() => trackProductEvent('guest_demo_start', params, { gtag: failingGtag, dedupe: true })).not.toThrow();
        expect(trackProductEvent('guest_demo_start', params, { gtag: failingGtag, dedupe: true })).toBe(false);
        expect(trackProductEvent('guest_demo_start', params, { gtag: workingGtag, dedupe: true })).toBe(true);
        expect(workingGtag).toHaveBeenCalledOnce();
    });
});

describe('optional duplicate prevention', () => {
    it('deduplicates matching sanitized event payloads when requested', () => {
        const gtag = vi.fn();
        const params = { tab: 'gallery', variant: 'demo_v1' };

        expect(trackProductEvent('guest_demo_tab_view', params, { gtag, dedupe: true })).toBe(true);
        expect(trackProductEvent('guest_demo_tab_view', params, { gtag, dedupe: true })).toBe(false);
        expect(trackProductEvent('guest_demo_tab_view', { tab: 'diet', variant: 'demo_v1' }, { gtag, dedupe: true })).toBe(true);
        expect(gtag).toHaveBeenCalledTimes(2);
    });

    it('supports a local-only custom dedupe key and reset', () => {
        const gtag = vi.fn();

        expect(trackProductEvent('first_reward_view', { entry_point: 'reward_prompt' }, {
            gtag,
            dedupeKey: 'first-reward-current-session'
        })).toBe(true);
        expect(trackProductEvent('first_reward_view', { entry_point: 'direct' }, {
            gtag,
            dedupeKey: 'first-reward-current-session'
        })).toBe(false);

        resetProductEventDedupe();
        expect(trackProductEvent('first_reward_view', { entry_point: 'direct' }, {
            gtag,
            dedupeKey: 'first-reward-current-session'
        })).toBe(true);
        expect(gtag).toHaveBeenCalledTimes(2);
    });
});
