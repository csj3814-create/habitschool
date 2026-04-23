import { describe, expect, it } from 'vitest';
import rewardMarketModule from '../functions/reward-market.js';

const { __test } = rewardMarketModule;

describe('reward market pricing helpers', () => {
    it('defaults to phase1 pricing mode unless phase2 is explicit', () => {
        expect(__test.normalizePricingMode('')).toBe('phase1_fixed_internal');
        expect(__test.normalizePricingMode('phase2_hybrid_band')).toBe('phase2_hybrid_band');
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

    it('quotes phase1 items at the internal fixed price', () => {
        const quoted = __test.quoteCatalogItem(
            {
                sku: 'baemin-2000',
                faceValueKrw: 2000,
                purchasePriceKrw: 1900,
                brandName: '배민',
                displayName: '배민 2,000원',
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
                minRedeemHbt: 2000,
                pricingMode: 'phase1_fixed_internal',
                deliveryMode: 'app_vault',
                fallbackPolicy: 'manual_resend',
                dailyBandPct: 10,
                weeklyBandPct: 25,
            }
        );

        expect(quoted.hbtCost).toBe(2000);
        expect(quoted.deliveryMode).toBe('app_vault');
        expect(quoted.fallbackPolicy).toBe('manual_resend');
    });

    it('disables issuance when pricing is unavailable or bizmoney is below the floor', () => {
        const limits = __test.buildLimitSummary(
            {
                dailyLimitHbt: 20000,
                weeklyLimitHbt: 100000,
                monthlyLimitHbt: 300000,
            },
            {
                dailyHbt: 0,
                weeklyHbt: 0,
                monthlyHbt: 0,
                dailyCount: 0,
                weeklyCount: 0,
                monthlyCount: 0,
            }
        );

        const unavailablePricing = __test.buildIssuancePolicy({
            config: {
                mode: 'live',
                minBizmoneyKrw: 30000,
            },
            pricing: { quoteState: 'unavailable' },
            reserve: {},
            limitSummary: limits,
            bizmoney: { balanceKrw: 50000 },
        });
        expect(unavailablePricing.issuanceEnabled).toBe(false);

        const lowBizmoney = __test.buildIssuancePolicy({
            config: {
                mode: 'live',
                minBizmoneyKrw: 30000,
            },
            pricing: { quoteState: 'ready' },
            reserve: {},
            limitSummary: limits,
            bizmoney: { balanceKrw: 10000 },
        });
        expect(lowBizmoney.issuanceEnabled).toBe(false);
    });
});
