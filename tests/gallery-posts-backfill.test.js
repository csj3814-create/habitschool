import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
    parseCliArgs,
    getKstDateString,
    getBackfillDateWindow,
    getProjectStorageBuckets,
    planGalleryProjection,
    summarizeProjectionPlans,
    createRestContext,
    createProjectionWrite,
} = require('../scripts/backfill-gallery-posts-2026-07-10.js');

const SHARED_MEAL_URL = `https://firebasestorage.googleapis.com/v0/b/habitschool.appspot.com/o/${encodeURIComponent('diet_images/private-user-id/shared-meal.webp')}?alt=media&token=test`;

function shareableLog() {
    return {
        userId: 'private-user-id',
        userName: '예시 사용자',
        date: '2026-07-10',
        shareSettings: {
            hideIdentity: false,
            hideDate: false,
            hideDiet: false,
            hideExercise: true,
            hidePoints: false,
            hideMind: true,
        },
        awardedPoints: { dietPoints: 30 },
        diet: {
            breakfastUrl: SHARED_MEAL_URL,
            privateMemo: 'must never reach the gallery',
        },
        metrics: { weight: 70, glucose: 100 },
        dietAnalysis: { raw: 'private model output' },
    };
}

describe('gallery backfill CLI safety', () => {
    it('derives only the two Firebase default bucket names for a selected project', () => {
        expect(getProjectStorageBuckets('habitschool-staging')).toEqual([
            'habitschool-staging.firebasestorage.app',
            'habitschool-staging.appspot.com',
        ]);
    });

    it('defaults to a staging dry-run', () => {
        expect(parseCliArgs([])).toMatchObject({
            apply: false,
            dryRun: true,
            projectId: 'habitschool-staging',
            windowDays: 30,
        });
    });

    it('requires both --apply and an explicit known project before writes', () => {
        expect(() => parseCliArgs(['--apply'])).toThrow(/explicit --project/);
        expect(() => parseCliArgs(['--apply', '--project', 'unknown'])).toThrow(/Unknown project/);
        expect(parseCliArgs(['--apply', '--project=prod'])).toMatchObject({
            apply: true,
            dryRun: false,
            projectId: 'habitschool-8497b',
            projectWasExplicit: true,
        });
    });

    it('rejects unknown flags instead of silently widening the operation', () => {
        expect(() => parseCliArgs(['--days=365'])).toThrow(/Unknown argument/);
        expect(() => parseCliArgs(['--project', 'staging', '--project', 'prod']))
            .toThrow(/only be provided once/);
    });
});

describe('gallery backfill KST date window', () => {
    it('changes dates at midnight KST and includes exactly 30 calendar days', () => {
        expect(getKstDateString('2026-07-09T14:59:59.999Z')).toBe('2026-07-09');
        expect(getKstDateString('2026-07-09T15:00:00.000Z')).toBe('2026-07-10');
        expect(getBackfillDateWindow('2026-07-09T15:00:00.000Z')).toEqual({
            startDate: '2026-06-11',
            endDate: '2026-07-10',
            windowDays: 30,
        });
    });
});

describe('gallery backfill projection planning', () => {
    it('uses the production sanitizer and never copies private health or AI fields', () => {
        const plan = planGalleryProjection({
            logId: 'private-user-id_2026-07-10',
            dailyLog: shareableLog(),
        });

        expect(plan.action).toBe('upsert');
        expect(plan.payload.diet.breakfastUrl).toBe(SHARED_MEAL_URL);
        expect(plan.payload).not.toHaveProperty('metrics');
        expect(plan.payload).not.toHaveProperty('dietAnalysis');
        expect(JSON.stringify(plan.payload)).not.toContain('must never reach the gallery');
        expect(JSON.stringify(plan.payload)).not.toContain('private model output');
    });

    it('deletes an existing projection when every category becomes hidden', () => {
        const dailyLog = shareableLog();
        dailyLog.shareSettings.hideDiet = true;

        expect(planGalleryProjection({
            logId: 'private-user-id_2026-07-10',
            dailyLog,
            existingPost: { schemaVersion: 1 },
        }).action).toBe('delete');

        expect(planGalleryProjection({
            logId: 'private-user-id_2026-07-10',
            dailyLog,
            existingPost: null,
        }).action).toBe('noop');
    });

    it('reports aggregate action counts without exposing plan contents', () => {
        expect(summarizeProjectionPlans([
            { action: 'upsert', logId: 'secret-1' },
            { action: 'delete', logId: 'secret-2' },
            { action: 'noop', logId: 'secret-3' },
        ])).toEqual({
            scanned: 3,
            upsert: 1,
            delete: 1,
            noop: 1,
            writes: 2,
        });
    });

    it('replaces the projection under an update-time precondition and server timestamp', () => {
        const context = createRestContext('habitschool-staging', 'not-a-real-token', async () => {});
        const plan = planGalleryProjection({
            logId: 'private-user-id_2026-07-10',
            dailyLog: shareableLog(),
            existingPost: { comments: [] },
            existingUpdateTime: '2026-07-10T00:00:00.000000Z',
        });
        const write = createProjectionWrite(context, plan);

        expect(write.currentDocument).toEqual({
            updateTime: '2026-07-10T00:00:00.000000Z',
        });
        expect(write.updateTransforms).toEqual([{
            fieldPath: 'updatedAt',
            setToServerValue: 'REQUEST_TIME',
        }]);
        expect(write.update.fields).not.toHaveProperty('metrics');
        expect(write.update.fields).not.toHaveProperty('dietAnalysis');
    });
});
