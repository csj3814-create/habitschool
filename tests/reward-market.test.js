import { describe, expect, it } from 'vitest';
import rewardMarketModule from '../functions/reward-market.js';

const { __test } = rewardMarketModule;

function createFakeFirestore(initialDocs = {}) {
    const store = new Map(Object.entries(initialDocs).map(([path, value]) => [path, structuredClone(value)]));

    function cloneValue(value) {
        return value && typeof value === 'object' ? structuredClone(value) : value;
    }

    function normalizePath(path) {
        return String(path || '').replace(/^\/+|\/+$/g, '');
    }

    function mergeData(existing = {}, update = {}) {
        const next = { ...existing };
        Object.entries(update).forEach(([key, value]) => {
            if (value && typeof value === 'object' && value.__op === 'increment') {
                next[key] = (Number(next[key]) || 0) + Number(value.value || 0);
                return;
            }
            next[key] = cloneValue(value);
        });
        return next;
    }

    function writeDoc(path, value, options = {}) {
        const normalizedPath = normalizePath(path);
        const existing = store.get(normalizedPath) || {};
        const next = options.merge ? mergeData(existing, value || {}) : mergeData({}, value || {});
        store.set(normalizedPath, next);
    }

    function readDoc(path) {
        const normalizedPath = normalizePath(path);
        const data = store.get(normalizedPath);
        return {
            id: normalizedPath.split('/').pop(),
            exists: store.has(normalizedPath),
            data: () => cloneValue(data || {}),
            ref: doc(normalizedPath),
        };
    }

    function listCollection(path) {
        const prefix = `${normalizePath(path)}/`;
        return Array.from(store.entries())
            .filter(([docPath]) => docPath.startsWith(prefix) && !docPath.slice(prefix.length).includes('/'))
            .map(([docPath]) => readDoc(docPath));
    }

    function createQuery(collectionPath, clauses = [], max = null) {
        return {
            where(field, op, value) {
                return createQuery(collectionPath, [...clauses, { field, op, value }], max);
            },
            limit(limitValue) {
                return createQuery(collectionPath, clauses, limitValue);
            },
            async get() {
                let docs = listCollection(collectionPath);
                clauses.forEach(({ field, op, value }) => {
                    docs = docs.filter((docSnap) => {
                        const data = docSnap.data() || {};
                        const current = data[field];
                        if (op === '==') return current === value;
                        if (op === '>=') {
                            const currentMs = current instanceof Date ? current.getTime() : new Date(current).getTime();
                            const valueMs = value instanceof Date ? value.getTime() : new Date(value).getTime();
                            return currentMs >= valueMs;
                        }
                        throw new Error(`Unsupported query operator: ${op}`);
                    });
                });
                if (Number.isFinite(max)) {
                    docs = docs.slice(0, max);
                }
                return {
                    empty: docs.length === 0,
                    docs,
                };
            },
        };
    }

    function collection(path) {
        const normalizedPath = normalizePath(path);
        return {
            doc(id = `auto_${Math.random().toString(36).slice(2, 10)}`) {
                return doc(`${normalizedPath}/${id}`);
            },
            where(field, op, value) {
                return createQuery(normalizedPath, [{ field, op, value }], null);
            },
            limit(limitValue) {
                return createQuery(normalizedPath, [], limitValue);
            },
            async get() {
                const docs = listCollection(normalizedPath);
                return {
                    empty: docs.length === 0,
                    docs,
                };
            },
        };
    }

    function doc(path) {
        const normalizedPath = normalizePath(path);
        return {
            id: normalizedPath.split('/').pop(),
            path: normalizedPath,
            async get() {
                return readDoc(normalizedPath);
            },
            async set(value, options = {}) {
                writeDoc(normalizedPath, value, options);
            },
        };
    }

    return {
        collection,
        doc,
        batch() {
            const operations = [];
            return {
                set(ref, value, options = {}) {
                    operations.push({ type: 'set', ref, value, options });
                },
                async commit() {
                    operations.forEach((operation) => {
                        if (operation.type === 'set') {
                            writeDoc(operation.ref.path, operation.value, operation.options);
                        }
                    });
                },
            };
        },
        async runTransaction(handler) {
            const transaction = {
                async get(ref) {
                    return readDoc(ref.path);
                },
                set(ref, value, options = {}) {
                    writeDoc(ref.path, value, options);
                },
            };
            return handler(transaction);
        },
        __get(path) {
            return cloneValue(store.get(normalizePath(path)));
        },
    };
}

function createFakeFieldValue() {
    return {
        increment(value) {
            return { __op: 'increment', value };
        },
        serverTimestamp() {
            return new Date('2026-04-27T00:00:00.000Z');
        },
    };
}

class FakeHttpsError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

describe('reward market pricing helpers', () => {
    it('builds Giftishow live defaults and flags missing live config', () => {
        const config = __test.buildRewardMarketConfig({
            REWARD_MARKET_MODE: 'live',
            GIFTISHOW_API_BASE_URL: 'https://biz.example.com',
        });

        expect(config.mode).toBe('live');
        expect(config.providerReady).toBe(false);
        expect(config.missingProviderConfig).toEqual(expect.arrayContaining([
            'GIFTISHOW_CUSTOM_AUTH_CODE',
            'GIFTISHOW_CUSTOM_AUTH_TOKEN',
            'GIFTISHOW_CALLBACK_NO',
            'GIFTISHOW_USER_ID',
        ]));
        expect(config.orderBodyTemplate.api_code).toBe('0204');
        expect(config.bizmoneyBodyTemplate.api_code).toBe('0301');
    });

    it('resolves reward recipient phone from request, user profile, and auth fallback', () => {
        expect(__test.resolveRewardRecipientPhone({
            requestedPhone: '010-2222-3333',
            userData: { rewardRecipientPhone: '01099998888' },
            authPhoneNumber: '+821055556666',
        })).toBe('01022223333');

        expect(__test.resolveRewardRecipientPhone({
            requestedPhone: '',
            userData: { rewardRecipientPhone: '' },
            authPhoneNumber: '+821055556666',
        })).toBe('01055556666');
    });

    it('defaults to phase1 pricing mode unless phase2 is explicit', () => {
        expect(__test.normalizePricingMode('')).toBe('phase1_fixed_internal');
        expect(__test.normalizePricingMode('phase2_hybrid_band')).toBe('phase2_hybrid_band');
    });

    it('charges points immediately only in live mode', () => {
        expect(__test.shouldChargePointsImmediately({ mode: 'live' })).toBe(true);
        expect(__test.shouldChargePointsImmediately({ mode: 'mock' })).toBe(false);
        expect(__test.shouldChargePointsImmediately({})).toBe(false);
    });

    it('counts only live charged redemptions toward issuance usage', () => {
        expect(__test.shouldCountTowardIssuanceUsage({
            mode: 'live',
            status: 'issued',
            pointsCharged: true,
        })).toBe(true);
        expect(__test.shouldCountTowardIssuanceUsage({
            mode: 'live',
            status: 'pending_issue',
            pointsCharged: true,
        })).toBe(true);
        expect(__test.shouldCountTowardIssuanceUsage({
            mode: 'mock',
            status: 'issued',
            pointsCharged: false,
        })).toBe(false);
        expect(__test.shouldCountTowardIssuanceUsage({
            mode: 'live',
            status: 'failed_manual_review',
            pointsCharged: false,
        })).toBe(false);
    });

    it('keeps launch exchange limits independent from the 500P minimum', () => {
        const config = __test.buildRewardMarketConfig({
            REWARD_MARKET_MIN_REDEEM_POINTS: '500',
        });

        expect(config.minRedeemPoints).toBe(500);
        expect(config.dailyLimitPoints).toBe(2000);
        expect(config.weeklyLimitPoints).toBe(5000);
        expect(config.monthlyLimitPoints).toBe(10000);
    });

    it('clamps phase2 market price using the daily and weekly bands', () => {
        const pricing = __test.buildPublishedPricing({
            config: {
                pricingMode: 'phase2_hybrid_band',
                dailyBandPct: 10,
                weeklyBandPct: 25,
            },
            existing: {
                finalKrwPerHbt: 1,
                weekKey: __test.getKstWeekKey(new Date('2026-04-23T01:00:00Z')),
                weeklyAnchorKrwPerHbt: 1,
            },
            feed: {
                hbtUsdtTwap7d: 0.0005,
                usdtKrw: 1400,
                liquidityReady: true,
                source: 'test-feed',
            },
            now: new Date('2026-04-23T01:00:00Z'),
        });

        expect(pricing.rawKrwPerHbt).toBeCloseTo(0.7, 6);
        expect(pricing.finalKrwPerHbt).toBeCloseTo(0.9, 6);
        expect(pricing.quoteState).toBe('ready');
    });

    it('quotes phase1 items at the catalog-defined fixed point price', () => {
        const quoted = __test.quoteCatalogItem(
            {
                sku: 'mega-ice-americano-60d',
                faceValueKrw: 2000,
                purchasePriceKrw: 1940,
                pointCost: 2000,
                productImageUrl: 'https://bizimg.giftishow.com/Resource/goods/2024/G00002861259/G00002861259.jpg',
                brandLogoUrl: '/assets/reward-market/mega-mgc-logo.png',
                brandName: '메가MGC커피',
                displayName: '(ICE)아메리카노 모바일쿠폰',
                available: true,
            },
            {
                pricingMode: 'phase1_fixed_internal',
                quoteVersion: 'phase1:2026-04-23:fixed',
                quoteSource: 'fixed_internal_face_value',
                quoteState: 'ready',
                finalKrwPerHbt: 1,
                quotedAt: '2026-04-23T00:00:00.000Z',
                nextRefreshAt: '2026-04-24T00:00:00.000Z',
                dailyBandPct: 10,
                weeklyBandPct: 25,
            },
            {
                settlementAsset: 'points',
                minRedeemPoints: 500,
                pricingMode: 'phase1_fixed_internal',
                deliveryMode: 'app_vault',
                fallbackPolicy: 'manual_resend',
                dailyBandPct: 10,
                weeklyBandPct: 25,
            }
        );

        expect(quoted.settlementAsset).toBe('points');
        expect(quoted.pointCost).toBe(2000);
        expect(quoted.hbtCost).toBe(2000);
        expect(quoted.deliveryMode).toBe('app_vault');
        expect(quoted.fallbackPolicy).toBe('manual_resend');
        expect(quoted.productImageUrl).toBe('https://bizimg.giftishow.com/Resource/goods/2024/G00002861259/G00002861259.jpg');
        expect(quoted.brandLogoUrl).toBe('/assets/reward-market/mega-mgc-logo.png');
    });

    it('uses the catalog validity days when building mock coupon expiry', () => {
        expect(__test.resolveRewardValidityDays({ validityDays: 60 })).toBe(60);
        expect(__test.resolveRewardValidityDays({ stockLabel: '60일 발급' })).toBe(60);

        const issued = __test.buildMockIssuedCoupon({ validityDays: 60 }, '');
        const expiresAt = new Date(issued.expiresAt);
        const diffDays = Math.round((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
        expect(diffDays).toBeGreaterThanOrEqual(59);
        expect(diffDays).toBeLessThanOrEqual(60);
    });

    it('allows dismiss only for failed or non-live pending reward redemptions', () => {
        expect(__test.canDismissRewardRedemption({ status: 'failed_manual_review', mode: 'live' })).toBe(true);
        expect(__test.canDismissRewardRedemption({ status: 'cancelled', mode: 'live' })).toBe(true);
        expect(__test.canDismissRewardRedemption({ status: 'issued', mode: 'mock' })).toBe(true);
        expect(__test.canDismissRewardRedemption({ status: 'pending_issue', mode: 'mock' })).toBe(true);
        expect(__test.canDismissRewardRedemption({ status: 'pending_issue', mode: 'live' })).toBe(false);
        expect(__test.canDismissRewardRedemption({ status: 'issued', mode: 'live' })).toBe(false);
    });

    it('keeps point settlement available without a price quote but still blocks low bizmoney', () => {
        const limits = __test.buildLimitSummary(
            {
                dailyLimitPoints: 20000,
                weeklyLimitPoints: 100000,
                monthlyLimitPoints: 300000,
            },
            {
                dailyPoints: 0,
                weeklyPoints: 0,
                monthlyPoints: 0,
                dailyCount: 0,
                weeklyCount: 0,
                monthlyCount: 0,
            }
        );

        const pointSettlement = __test.buildIssuancePolicy({
            config: {
                mode: 'live',
                minBizmoneyKrw: 30000,
                settlementAsset: 'points',
                providerReady: true,
            },
            pricing: { quoteState: 'unavailable' },
            reserve: {},
            limitSummary: limits,
            bizmoney: { balanceKrw: 50000 },
        });
        expect(pointSettlement.issuanceEnabled).toBe(true);

        const hbtSettlement = __test.buildIssuancePolicy({
            config: {
                mode: 'live',
                minBizmoneyKrw: 30000,
                settlementAsset: 'hbt',
                providerReady: true,
            },
            pricing: { quoteState: 'unavailable' },
            reserve: {},
            limitSummary: limits,
            bizmoney: { balanceKrw: 50000 },
        });
        expect(hbtSettlement.issuanceEnabled).toBe(false);

        const lowBizmoney = __test.buildIssuancePolicy({
            config: {
                mode: 'live',
                minBizmoneyKrw: 30000,
                settlementAsset: 'points',
                providerReady: true,
            },
            pricing: { quoteState: 'ready' },
            reserve: {},
            limitSummary: limits,
            bizmoney: { balanceKrw: 10000 },
        });
        expect(lowBizmoney.issuanceEnabled).toBe(false);
    });

    it('completes mock redemptions without charging points or crashing on reserve ledger writes', async () => {
        const db = createFakeFirestore({
            'users/test-user': {
                displayName: '최석재',
                coins: 3264,
            },
        });
        const FieldValue = createFakeFieldValue();
        const config = __test.buildRewardMarketConfig({
            REWARD_MARKET_MODE: 'mock',
            REWARD_MARKET_SETTLEMENT_ASSET: 'points',
            REWARD_MARKET_MIN_REDEEM_POINTS: '500',
            REWARD_MARKET_DAILY_LIMIT_POINTS: '2000',
            REWARD_MARKET_WEEKLY_LIMIT_POINTS: '5000',
            REWARD_MARKET_MONTHLY_LIMIT_POINTS: '10000',
        });

        const result = await rewardMarketModule.redeemRewardCoupon({
            db,
            FieldValue,
            HttpsError: FakeHttpsError,
            uid: 'test-user',
            userData: {
                displayName: '최석재',
                coins: 3264,
            },
            config,
            sku: 'mega-ice-americano-60d',
            recipientPhone: '',
            quoteVersion: 'phase1_fixed_internal:2026-04-27:fixed',
            quoteSource: 'fixed_internal_face_value',
            quotedPointCost: 2000,
            clientRequestId: 'mock-smoke-test',
            authPhoneNumber: '',
        });

        expect(result.success).toBe(true);
        expect(result.status).toBe('issued');
        expect(db.__get('users/test-user').coins).toBe(3264);
        expect(db.__get('reward_redemptions/req_test-user_mock-smoke-test').pointsCharged).toBe(false);
        expect(db.__get('reward_reserve_metrics/main').issuedCount).toBe(1);
    });
});
