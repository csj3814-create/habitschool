import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import {
    HEALTH_EXERCISE_TYPES,
    describeHealthExercise,
    describeHealthSleep,
    formatDuration,
    healthExerciseLabel
} from '../js/health-connect-activity.js';
import { describeHealthConnectAutoSave } from '../js/health-connect-autosave.js';
import { readRepoFile } from './source-helpers.js';

const require = createRequire(import.meta.url);
const { buildGalleryPostFromDailyLog } = require('../functions/gallery-posts.js');
const HANGUL = /[가-힣]/;

// 2026-10-15 오류 제보(대표, 영어 앱 /en 운동 탭): "영어 앱에 한글이 보이네".
// "Health Connect 다시 가져오기", "Samsung Health 6,838보 반영됨 · 오후 5:08 기준",
// "Samsung Health 운동 기록 · 달리기 · 12:11 · 33분 · 4km" 가 한국어로만 만들어졌다.
describe('영어 앱의 Health Connect 문구에는 한글이 없다', () => {
    const run = { type: 'running', label: '달리기', startEpochMillis: Date.parse('2026-10-15T03:11:00Z'), minutes: 33, distanceKm: 4 };
    const night = {
        providerLabel: 'Samsung Health', startEpochMillis: Date.parse('2026-10-14T14:30:00Z'), endEpochMillis: Date.parse('2026-10-14T22:00:00Z'),
        asleepMinutes: 420, deepMinutes: 80, remMinutes: 90, awakeMinutes: 30, hasStages: true
    };

    it('운동 이름은 저장된 한국어 대신 종류에서 영어로', () => {
        Object.entries(HEALTH_EXERCISE_TYPES).forEach(([key, type]) => {
            expect(type.en, key).toBeTruthy();
            expect(type.en, key).not.toMatch(HANGUL);
        });
        expect(healthExerciseLabel(run, { english: true })).toBe('Running');
        expect(healthExerciseLabel(run)).toBe('달리기');
    });

    it('운동 한 줄', () => {
        expect(describeHealthExercise(run, { english: true })).toBe('🏃 Running · 12:11 · 33 min · 4km');
        expect(describeHealthExercise(run)).toBe('🏃 달리기 · 12:11 · 33분 · 4km');
    });

    it('수면 한 줄', () => {
        const text = describeHealthSleep(night, { english: true });
        expect(text).not.toMatch(HANGUL);
        expect(text).toBe('Samsung Health · 23:30~07:00 · 7h asleep (deep 1h 20m · REM 1h 30m · awake 30 min)');
    });

    it('시간 표기', () => {
        expect(formatDuration(33, { english: true })).toBe('33 min');
        expect(formatDuration(90, { english: true })).toBe('1h 30m');
        expect(formatDuration(90)).toBe('1시간 30분');
    });

    it('앱을 열 때 자동 저장 안내', () => {
        const text = describeHealthConnectAutoSave({ steps: 6838, sleepHours: 7, exercises: 1 }, { english: true });
        expect(text).toBe("📲 Added 6,838 steps · 7h of sleep · 1 workout from Health Connect to today's log.");
    });

    it('화면 코드의 한국어 문구마다 영어 짝이 있다', () => {
        const app = readRepoFile('js/app-core.js');
        [
            "'Refresh from Health Connect'",
            'steps from ${providerLabel}',
            'Synced from ${surfaceLabel}',
            "isEnglishLocale() ? 'workouts' : '운동 기록'",
            'describeHealthExercise(item, { english: isEnglishLocale() })',
            'describeHealthSleep(night, { english: isEnglishLocale() })',
            'describeHealthConnectAutoSave(result.applied, { english: isEnglishLocale() })',
            "new Intl.DateTimeFormat(isEnglishLocale() ? 'en-US' : 'ko-KR'",
            'Got ${_healthSleepSync.sleepHours} hours of sleep.',
            "Health Connect has no new steps yet."
        ].forEach((needle) => expect(app, needle).toContain(needle));
        // 걸음 안내 토스트는 두 군데 모두
        expect(app.match(/Got \$\{_activeNativeStepImport\.stepCount\.toLocaleString\('en-US'\)\} steps/g) || []).toHaveLength(2);
    });

    it('정적 버튼도 번역한다', () => {
        const i18n = readRepoFile('js/i18n.js');
        expect(i18n).toContain("['#sleep-hc-btn', 'Import sleep from Health Connect']");
        expect(i18n).toContain("['#body-hc-btn', '🔗 Health Connect']");
    });
});

// 같은 날 대표 결정: "영어앱에서는 갤러리 탭이 없어 … 영어앱에서 입력된 감사일기는 숨기는
// 걸로 하자. 다른 식단, 운동, 수면 기록은 갤러리에서 노출되어도 되겠지?"
describe('영어 앱에서 쓴 감사 일기는 갤러리에 싣지 않는다', () => {
    const BUCKET = 'habitschool-8497b.firebasestorage.app';
    const sleepUrl = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/sleep_images%2Fu1%2Fa.jpg?alt=media`;
    const build = (gratitudeLocale) => buildGalleryPostFromDailyLog({
        logId: 'u1_2026-10-20',
        dailyLog: {
            userId: 'u1', userName: 'Tester', date: '2026-10-20', gratitudeLocale,
            shareSettings: {},
            sleepAndMind: { sleepImageUrl: sleepUrl, gratitude: 'grateful for family', sleepAnalysis: { type: 'sleep', grade: 'B', summary: 'ok' } }
        },
        updatedAt: new Date(),
        allowedStorageBuckets: [BUCKET]
    });

    it('영어 앱에서 쓴 것은 빼고, 수면 사진과 분석은 그대로', () => {
        const post = build('en');
        expect(post.sleepAndMind.gratitude).toBeUndefined();
        expect(post.sleepAndMind.sleepImageUrl).toBe(sleepUrl);
        expect(post.sleepAndMind.sleepAnalysis.grade).toBe('B');
    });

    it('한국어 앱에서 쓴 것과 표시가 없는 옛 기록은 지금처럼', () => {
        expect(build('ko').sleepAndMind.gratitude).toBe('grateful for family');
        expect(build(undefined).sleepAndMind.gratitude).toBe('grateful for family');
    });

    it('저장할 때 어느 언어 앱에서 썼는지 남긴다 — 규칙 목록이 없는 맨 위 칸에', () => {
        const app = readRepoFile('js/app-core.js');
        expect(app).toContain("gratitudeLocale: isEnglishLocale() ? 'en' : 'ko',");
        const rules = readRepoFile('firestore.rules');
        // sleepAndMind 는 hasOnly 목록이 있다 — 거기에 넣으면 규칙 배포 전까지 저장이 거부된다
        const mindRule = rules.slice(rules.indexOf('function isValidSleepAndMindData'), rules.indexOf('function isValidAwardedPoints'));
        expect(mindRule).not.toContain('gratitudeLocale');
        const daily = rules.slice(rules.indexOf('function isValidDailyLog'), rules.indexOf('function isCanonicalDailyLogId'));
        expect(daily).not.toContain('keys().hasOnly');
    });

    // 2026-10-21(E5-1): 영어 앱에 갤러리 탭이 열려 안내도 보인다. 영어 감사 일기는 이 안내가 운영에 나간 날부터 공개한다
    // (functions/gallery-posts.js GRATITUDE_EN_PUBLIC_FROM, tests/english-gallery.test.js).
    it('영어 앱에서도 "갤러리에 공개돼요" 안내를 보인다', () => {
        expect(readRepoFile('styles-en.css')).not.toMatch(/html\.locale-en #gratitude-public-note \{/);
    });
});
