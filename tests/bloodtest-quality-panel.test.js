import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

const RUNTIME = readRepoFile('functions/runtime.js');
const ADMIN = readRepoFile('admin.html');
const BACKFILL = readRepoFile('scripts/backfill-bloodtest-health-profile-2026-08-14.js');

// 관제탑에서 "혈액검사 분석이 잘 도는가"를 상시로 보되, 그 답을 얻자고 남의 의료정보를
// 열람하지는 않는다. 개수와 분포로 답할 수 있는 질문이다.
describe('the control tower answers the question without reading anyone\'s results', () => {
    it('is admin-only', () => {
        const fn = RUNTIME.split('exports.getBloodTestQualityStats = onCall(')[1].split('\n);')[0];
        expect(fn).toContain('await assertAdminRequest(request);');
    });

    it('returns counts and distributions, never a member\'s values', () => {
        const fn = RUNTIME.split('exports.getBloodTestQualityStats = onCall(')[1].split('\n);')[0];
        // 집계 필드만 담는다.
        expect(fn).toContain('return { success: true, stats };');
        // 개별 수치나 소견·조언 본문을 실어 보내지 않는다.
        expect(fn).not.toContain('stats.values');
        expect(fn).not.toContain('summary: d.summary');
        expect(fn).not.toContain('advice: d.advice');
        // 길이나 유무만 센다.
        expect(fn).toContain('if (String(d.summary || "").trim()) stats.withSummary += 1;');
        expect(fn).toContain('if (String(d.advice || "").trim()) stats.withAdvice += 1;');
    });

    it('does not leak uids either', () => {
        const fn = RUNTIME.split('exports.getBloodTestQualityStats = onCall(')[1].split('\n);')[0];
        expect(fn).not.toContain('parent.parent');
        expect(fn).not.toContain('uid');
    });

    it('measures the things that would show the feature breaking', () => {
        const fn = RUNTIME.split('exports.getBloodTestQualityStats = onCall(')[1].split('\n);')[0];
        for (const key of ['missingUnit', 'missingReference', 'invalidStatus',
            'withSummary', 'withAdvice', 'metricCountBuckets', 'unknownMetricKeys']) {
            expect(fn, `${key} should be tracked`).toContain(key);
        }
    });

    it('is wired into the admin page', () => {
        expect(ADMIN).toContain("httpsCallable(fns, 'getBloodTestQualityStats')");
        expect(ADMIN).toContain('window.loadBloodTestQuality = async function loadBloodTestQuality()');
        expect(ADMIN).toContain('loadBloodTestQuality()');
        expect(ADMIN).toContain('id="bt-total"');
        expect(ADMIN).toContain('id="bt-stale"');
    });

    it('says on screen that individual values are not shown', () => {
        expect(ADMIN).toContain('개인 수치는 표시하지 않습니다');
    });
});

// 실제로 5년 전 검사지가 올라와 있었다. 오래된 수치를 '최신'으로 써서 오늘의 건강
// 점수를 매기면 틀린 조언이 된다.
describe('a stale report is not treated as a current measurement', () => {
    it('has one freshness rule, named', () => {
        expect(RUNTIME).toContain('const BLOOD_TEST_FRESH_DAYS = 365;');
        expect(RUNTIME).toContain('function bloodTestAgeInDays(testDate, analyzedAt)');
    });

    it('stops the analysis from writing an old result into the profile', () => {
        expect(RUNTIME).toContain('const freshEnough = ageDays !== null && ageDays <= BLOOD_TEST_FRESH_DAYS;');
        expect(RUNTIME).toContain('if (freshEnough) {');
        // 반영하지 않았다는 사실은 로그로 남긴다. 조용히 건너뛰면 다음 사람이 또 헤맨다.
        expect(RUNTIME).toContain('[analyzeBloodTest] profile not updated (test too old or undated):');
    });

    it('records when the reflected measurement was taken', () => {
        expect(RUNTIME).toContain("profileUpdate['healthProfile.latestBloodTestDate']");
    });

    it('builds the fallback shape from the same patch, so the two cannot drift', () => {
        const fn = RUNTIME.split('await db.doc(`users/${uid}`).update(profileUpdate).catch(async (error) => {')[1]
            .split('});')[0];
        expect(fn).toContain('for (const [dottedPath, value] of Object.entries(profileUpdate))');
        expect(fn).not.toContain('metrics.glucose?.value ?');
    });

    it('applies the same rule in the backfill, and says who was skipped', () => {
        expect(BACKFILL).toContain('const FRESH_DAYS = 365;');
        expect(BACKFILL).toContain('const fresh = days !== null && days <= FRESH_DAYS;');
        expect(BACKFILL).toContain('if (fresh && value !== undefined && profile[nestedKey] === undefined)');
        expect(BACKFILL).toContain('수치 반영 안 함');
        // 오래된 검사여도 잘못 만들어진 필드 정리는 해야 한다.
        expect(BACKFILL).toContain('오래된 검사는 값을 넣지 않되, 잘못 만들어진 필드 정리는 그대로 한다.');
    });
});
