import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGalleryPostFromDailyLog } from '../functions/gallery-posts.js';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(resolve(ROOT_DIR, 'js/app-core.js'), 'utf8');
const BUCKET = 'habitschool-8497b.firebasestorage.app';
const url = (folder) => `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${folder}%2Fu1%2Fa.jpg?alt=media`;

const buildPost = (sleepAndMind) => buildGalleryPostFromDailyLog({
    logId: 'u1_2026-09-16',
    dailyLog: {
        userId: 'u1', userName: '테스트', date: '2026-09-16',
        shareSettings: { hideMind: false },
        sleepAndMind,
    },
    updatedAt: new Date(),
    allowedStorageBuckets: [BUCKET],
});

const FULL_ANALYSIS = {
    type: 'sleep',
    grade: 'B',
    summary: '6시간 50분 주무셨습니다',
    details: { sleepDuration: '6시간 50분', sleepQuality: '보통', emotionTone: '차분함', stressLevel: '낮음' },
    feedback: '조금 더 일찍 주무세요',
};

// 2026-09-17 요청: "갤러리에서 운동 이미지, 영상, 수면 아래에도 분석 확인 버튼
// 나타나게 해 줘."
//
// 재 보니 운동은 이미 실려 나가고 있었고(normalizeExerciseAnalysisEntry) 수면만
// 빠져 있었다. 원본 daily_logs 에는 sleepAnalysis 가 있는데 투영이 버려서,
// 화면이 아무리 버튼을 그릴 준비를 해도 걸 것이 없었다.
describe('the gallery carries the sleep analysis it is asked to show', () => {
    it('sends it, so the button has something to open', () => {
        const analysis = buildPost({ sleepImageUrl: url('sleep_images'), sleepAnalysis: FULL_ANALYSIS })
            .sleepAndMind.sleepAnalysis;
        expect(analysis).toBeTruthy();
        expect(analysis.grade).toBe('B');
        expect(analysis.summary).toBe('6시간 50분 주무셨습니다');
        expect(analysis.details.sleepDuration).toBe('6시간 50분');
        expect(analysis.details.sleepQuality).toBe('보통');
    });

    it('keeps the kind, or the overlay reads it as a diet analysis', () => {
        // js/app-core.js toggleGalleryAiOverlay 가 type 으로 분기한다.
        expect(buildPost({ sleepImageUrl: url('sleep_images'), sleepAnalysis: FULL_ANALYSIS })
            .sleepAndMind.sleepAnalysis.type).toBe('sleep');
    });

    it('leaves the mood out of a feed other people read', () => {
        // 수면 캡처를 공유하는 것과 "이 사람의 감정 상태는 이렇다" 는 AI 판단을
        // 함께 거는 것은 다른 일이다. 필요하면 화이트리스트에 더하면 된다.
        const text = JSON.stringify(
            buildPost({ sleepImageUrl: url('sleep_images'), sleepAnalysis: FULL_ANALYSIS }).sleepAndMind.sleepAnalysis
        );
        expect(text).not.toContain('emotionTone');
        expect(text).not.toContain('stressLevel');
        expect(text).not.toContain('차분함');
        expect(text).not.toContain('낮음');
    });

    it('sends nothing when there is no picture to hang it on', () => {
        const post = buildPost({ meditationDone: true, sleepAnalysis: FULL_ANALYSIS });
        expect(post?.sleepAndMind?.sleepAnalysis).toBeUndefined();
    });

    it('sends nothing when the analysis is empty or malformed', () => {
        for (const bad of [null, {}, { grade: 'Z' }, [], 'text']) {
            const post = buildPost({ sleepImageUrl: url('sleep_images'), sleepAnalysis: bad });
            expect(post?.sleepAndMind?.sleepAnalysis, JSON.stringify(bad)).toBeUndefined();
        }
    });

    it('stays out of a post where 마음 sharing is off', () => {
        const post = buildGalleryPostFromDailyLog({
            logId: 'u1_2026-09-16',
            dailyLog: {
                userId: 'u1', userName: '테스트', date: '2026-09-16',
                shareSettings: { hideMind: true },
                diet: { breakfastUrl: url('diet_images') },
                sleepAndMind: { sleepImageUrl: url('sleep_images'), sleepAnalysis: FULL_ANALYSIS },
            },
            updatedAt: new Date(),
            allowedStorageBuckets: [BUCKET],
        });
        expect(post.sleepAndMind).toBeFalsy();
    });

    it('drops caches written before this field existed', () => {
        // 기기에 남은 게시물 캐시(최대 24시간)에는 새 필드가 없다. 번호를 올리지
        // 않으면 고쳐도 그 사람 화면에서는 버튼이 안 뜬다.
        expect(APP).toContain('const GALLERY_PERSISTED_POST_SCHEMA_VERSION = 3;');
    });
});
