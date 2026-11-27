import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import {
    analysisBasis,
    buildExerciseAnalysisText,
    buildSleepAnalysisText,
    needsExerciseAnalysis,
    needsSleepAnalysis,
    sleepBasis
} from '../js/health-ai-text.js';
import { buildHealthConnectAutoSavePatch } from '../js/health-connect-autosave.js';
import { readAppSource, readRepoFile } from './source-helpers.js';

// 2026-11-27 대표: "AI 분석도 붙어야지" — 워치 달리기·수면에도 사진처럼 해빛코치 분석.
const require = createRequire(import.meta.url);
const kst = (d, h, m = 0) => Date.UTC(2026, 10, d, h - 9, m);
const clock = (ms) => new Date(ms + 9 * 3600000).toISOString().slice(11, 16);

const run = {
    type: 'running', label: '달리기', startEpochMillis: kst(27, 12, 5), endEpochMillis: kst(27, 12, 30),
    minutes: 25, kcal: 230, distanceKm: 3, hr: [120, 125, 130, 0, 128], hrAvg: 126, hrMax: 130,
    providerLabel: 'Samsung Health + Nothing X'
};
const night = {
    source: 'health_connect', providerLabel: 'Nothing X', wakeDate: '2026-11-27',
    startEpochMillis: kst(26, 20, 28), endEpochMillis: kst(27, 9, 54), asleepMinutes: 568, inBedMinutes: 568,
    deepMinutes: 142, remMinutes: 117, lightMinutes: 309, awakeMinutes: 0, hasStages: true, sleepHours: 9.5,
    stages: [0, 370, 2, 608, 198, 2]
};

describe('분석에 보내는 글 — 숫자만, 위치 없음', () => {
    it('운동: 종목·시간·거리·페이스·심박 흐름·기기', () => {
        const text = buildExerciseAnalysisText({ ...run, route: [0, 0, 10, 10] }, { formatClock: clock });
        expect(text).toContain('종목: 달리기');
        expect(text).toContain('시작: 12:05, 운동 시간 25분');
        expect(text).toContain(`평균 페이스: 8'20"/km`);
        expect(text).toContain('심박: 평균 126bpm, 최고 130bpm');
        expect(text).toContain('측정 기기: Samsung Health + Nothing X');
        expect(text).not.toMatch(/route|동선/);
        expect(buildExerciseAnalysisText(run, { english: true, formatClock: clock })).not.toMatch(/[가-힣]/);
    });

    it('수면: 시각·잔 시간·단계·길게 깨어 있던 때', () => {
        const text = buildSleepAnalysisText(night, { formatClock: clock });
        expect(text).toContain('잠든 시각 20:28, 깬 시각 09:54');
        expect(text).toContain('잔 시간: 9시간 28분 (9.5시간)');
        expect(text).toContain('깊은 잠 2시간 22분');
        expect(text).toContain('밤사이 길게 깨어 있던 때: 02:38~06:36');
        expect(buildSleepAnalysisText(night, { english: true, formatClock: clock })).not.toMatch(/[가-힣]/);
    });
});

describe('한 번만 — 기록이 바뀔 때만 다시', () => {
    it('운동: 없으면 하고, 같은 기록이면 다시 하지 않고, 심박이 새로 오면 다시', () => {
        expect(needsExerciseAnalysis(run)).toBe(true);
        const analyzed = { ...run, aiAnalysis: { intensity: '중강도', basis: analysisBasis(run) } };
        expect(needsExerciseAnalysis(analyzed)).toBe(false);
        expect(needsExerciseAnalysis({ ...analyzed, hr: [...run.hr, 131] })).toBe(true);
        expect(needsExerciseAnalysis({ ...run, minutes: 5 })).toBe(false); // 짧은 운동은 하지 않는다
    });

    it('수면: 캡처가 있거나, 회원이 고친 시간이거나, 회원이 따로 받은 분석이 있으면 하지 않는다', () => {
        const sam = { sleepHours: 9.5, sleepSync: night };
        expect(needsSleepAnalysis(sam)).toBe(true);
        expect(needsSleepAnalysis({ ...sam, sleepImageUrl: 'https://x' })).toBe(false);
        expect(needsSleepAnalysis({ ...sam, sleepHours: 7 })).toBe(false);
        expect(needsSleepAnalysis({ ...sam, sleepAnalysis: { grade: 'B' } })).toBe(false);
        expect(needsSleepAnalysis({ ...sam, sleepAnalysis: { source: 'health_connect', basis: sleepBasis(night) } })).toBe(false);
        expect(needsSleepAnalysis({ ...sam, sleepAnalysis: { source: 'health_connect', basis: 'old' } })).toBe(true);
    });
});

describe('앱을 열 때마다 운동 목록을 새로 써도 분석은 남는다', () => {
    it('같은 운동이 다시 오면 저장된 분석을 이어 붙인다', () => {
        const today = '2026-11-27';
        const savedSession = { ...run, aiAnalysis: { intensity: '중강도', feedback: '좋아요', basis: analysisBasis(run) } };
        const savedLog = { date: today, exercise: { healthSessions: [savedSession] } };
        const fresh = { ...run, kcal: 240 }; // 칼로리가 바뀌어 다시 저장된다
        const r = buildHealthConnectAutoSavePatch({
            savedLog, stepImport: null, todayStr: today,
            activity: { exercisePermitted: true, exercises: [fresh] }
        });
        expect(r.patch.exercise.healthSessions[0].kcal).toBe(240);
        expect(r.patch.exercise.healthSessions[0].aiAnalysis.feedback).toBe('좋아요');
    });
});

describe('저장 · 갤러리', () => {
    const APP = readAppSource();

    it('수면 분석의 잔 시간은 워치 값 그대로 — 수면 칸·포인트가 흔들리지 않게', () => {
        const save = APP.split('async function saveHealthSleepAnalysis(')[1].split('\n}\n')[0];
        expect(save).toContain('sleepHours: Number(sync.sleepHours)');
        expect(save).toContain("source: 'health_connect'");
        expect(save).toContain('if (!needsSleepAnalysis(sam) || sleepBasis(sam.sleepSync) !== basis) return;');
    });

    it('자동 저장 뒤 조용히 분석을 붙인다 (실패 알림 없음)', () => {
        expect(APP).toContain('ensureHealthAiAnalysis(user.uid, docId, committed);');
        expect(APP).toContain('ensureHealthAiAnalysis(user.uid, docId, savedLog);');
        const req = readRepoFile('js/diet-analysis.js').split('export async function requestHealthRecordAnalysis(')[1].split('\n}\n')[0];
        expect(req).not.toContain('showToast');
    });

    it('갤러리 게시물에 분석이 함께 간다', () => {
        const { buildGalleryPostFromDailyLog } = require('../functions/gallery-posts.js');
        const post = buildGalleryPostFromDailyLog({
            logId: 'u1_2026-11-27',
            dailyLog: {
                userId: 'u1', date: '2026-11-27',
                exercise: { healthSessions: [{ ...run, aiAnalysis: { intensity: '중강도', exerciseType: '달리기', feedback: '좋아요', isExercise: true } }] },
                sleepAndMind: { sleepHours: 9.5, sleepSync: night, sleepAnalysis: { source: 'health_connect', type: 'sleep', grade: 'A', summary: '푹 잤어요' } }
            },
            updatedAt: 'now'
        });
        expect(post.exercise.healthSessions[0].aiAnalysis.feedback).toBe('좋아요');
        expect(post.sleepAndMind.sleepAnalysis.grade).toBe('A');
    });

    it('서버: 사진 없이 글로도 운동을 분석한다', () => {
        const runtime = readRepoFile('functions/runtime.js');
        expect(runtime).toContain('if (!imageUrl && textData) {');
        expect(runtime).toContain('return analyzeExerciseFromText(textData, locale, correction);');
        expect(runtime).toContain('model: "gemini-2.5-flash"');
    });
});
