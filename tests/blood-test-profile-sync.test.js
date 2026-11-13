import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readRepoFile } from './source-helpers.js';

// 2026-11-13 제보: "혈액검사 결과지 업로드는 성공했어. 그런데 혈중지질수치는 자동 업데이트가
// 안되네. 혈중지질수치, 키, 허리둘레, BMI 등 받은 정보를 업데이트 해 줘."
// 콜레스테롤 카드는 "결과지를 올리면 자동으로 채워집니다" 라고 해 놓고 채우지 않았다.

const require = createRequire(import.meta.url);
const { buildBloodTestProfilePatch } = require('../functions/blood-test-profile.js');

const RUNTIME = readRepoFile('functions/runtime.js');
const APP = readRepoFile('js/app-core.js');
const ANALYSIS = readRepoFile('js/diet-analysis.js');

const metrics = (values) => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value }]));
const checkup = metrics({
    glucose: 98, hba1c: 5.4, triglyceride: 110, totalCholesterol: 192, hdl: 58,
    height: 172.4, weight: 70.2, waist: 84
});
const build = (overrides = {}) => buildBloodTestProfilePatch({
    metrics: checkup, testDate: '2026-11-01', profile: {}, ageDays: 12, freshDays: 365, ...overrides
});

describe('a checkup fills in the health info it carries', () => {
    it('moves lipids, height, waist and weight, not just glucose', () => {
        const { applied, patch } = build();
        expect(applied).toEqual({
            latestGlucose: 98, hba1c: '5.4', latestTriglyceride: 110,
            totalCholesterol: 192, hdl: 58,
            heightCm: 172.4, waistCm: 84,
            weight: 70.2, weightDate: '2026-11-01',
            latestBloodTestDate: '2026-11-01'
        });
        expect(patch['healthProfile.totalCholesterol']).toBe(192);
        expect(patch['healthProfile.hdl']).toBe(58);
        expect(Object.keys(patch).every((key) => key.startsWith('healthProfile.'))).toBe(true);
    });

    it('writes nothing from a test that is undated or older than a year', () => {
        expect(build({ testDate: '', ageDays: null }).patch).toEqual({});
        expect(build({ testDate: '2021-03-01', ageDays: 2000 }).patch).toEqual({});
        expect(build({ testDate: '2027-01-01', ageDays: -40 }).patch).toEqual({});
    });

    it('does not let an older sheet uploaded later replace newer lab values', () => {
        const { applied } = build({
            testDate: '2026-03-01', ageDays: 250,
            profile: { latestBloodTestDate: '2026-10-01', totalCholesterol: 180, heightCm: 172, waistCm: 82, updatedAt: '2026-10-02T00:00:00.000Z', weightDate: '2026-10-02' }
        });
        expect(applied).toEqual({});
    });

    it('keeps a height or waist the member corrected after the test', () => {
        const { applied } = build({
            profile: { heightCm: 173, waistCm: 80, updatedAt: '2026-11-10T03:00:00.000Z' }
        });
        expect(applied.heightCm).toBeUndefined();
        expect(applied.waistCm).toBeUndefined();
        expect(applied.totalCholesterol).toBe(192);
    });

    it('keeps a weight measured after the test', () => {
        const kept = build({ profile: { weight: 69.5, weightDate: '2026-11-08' } }).applied;
        expect(kept.weight).toBeUndefined();
        const replaced = build({ profile: { weight: 72, weightDate: '2026-09-01' } }).applied;
        expect(replaced.weight).toBe(70.2);
        expect(replaced.weightDate).toBe('2026-11-01');
    });

    it('throws away numbers no person has, as misreads', () => {
        const { applied } = build({ metrics: metrics({ totalCholesterol: 19200, hdl: 5, height: 17.2, waist: 840, weight: 7 }) });
        expect(applied).toEqual({});
    });
});

describe('the analysis reads those values and hands them back', () => {
    it('asks the model for height, weight and waist in both languages', () => {
        const ko = RUNTIME.split('const BLOOD_TEST_ANALYSIS_PROMPT = `')[1].split('`;')[0];
        const en = RUNTIME.split('const BLOOD_TEST_ANALYSIS_PROMPT_EN = `')[1].split('`;')[0];
        for (const prompt of [ko, en]) {
            expect(prompt).toContain('- height:');
            expect(prompt).toContain('- weight:');
            expect(prompt).toContain('- waist:');
        }
        expect(RUNTIME).toMatch(/BLOOD_TEST_PROMPT_FIELDS = Object\.freeze\(\[[\s\S]*?"height", "weight", "waist"/);
    });

    it('compares against the profile as it was before this upload', () => {
        expect(RUNTIME).toContain("profile: consentSnap.data()?.healthProfile || {},");
        expect(RUNTIME).toContain('profileApplied,');
    });

    it('fills the input boxes too, so the next save does not put the old value back', () => {
        expect(ANALYSIS).toContain("Object.defineProperty(analysis, 'profileApplied'");
        expect(APP).toContain('applyBloodTestProfileValues(analysis.profileApplied);');
        expect(APP).toMatch(/totalCholesterol: 'prof-total-chol',\s*hdl: 'prof-hdl',\s*heightCm: 'prof-height',\s*waistCm: 'prof-waist',\s*weight: 'prof-weight'/);
        expect(APP).toContain("console.info('[blood-test] 건강 정보에 반영:'");
    });
});
