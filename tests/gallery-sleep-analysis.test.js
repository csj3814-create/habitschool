import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGalleryPostFromDailyLog, GALLERY_POST_SCHEMA_VERSION } from '../functions/gallery-posts.js';

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

// 수면 분석은 2026-09-17 에 실었다가 09-18 에 뺐고, 2026-10-15 에 다시 싣는다.
//
//   09-18: "백필은 하지 않아도 되겠고 그럼 수면 분석은 AI 분석 확인을 빼는 게 낫겠는데?"
//   10-15: "수면 등급 보여주는 게 뭐 걸릴 게 있나? 나는 감사 일기도 보여줘도 된다고 보는데?"
//
// 식단은 처음부터 AI 등급을 공개해 왔고 수면 캡처는 이미 공개다. 숨기고 싶은 회원은
// 공유 설정의 '마음·AI 분석'(hideMind)을 끈다. 다만 감정·스트레스·조언은 여전히 뺀다 —
// 등급과는 결이 다른 AI 판단이다.
describe('the gallery shows the sleep grade, not the rest of the AI judgement', () => {
    it('carries grade, summary, duration and quality', () => {
        const post = buildPost({ sleepImageUrl: url('sleep_images'), sleepAnalysis: FULL_ANALYSIS });
        expect(post.sleepAndMind.sleepAnalysis).toEqual({
            type: 'sleep',
            grade: 'B',
            summary: '6시간 50분 주무셨습니다',
            details: { sleepDuration: '6시간 50분', sleepQuality: '보통' }
        });
    });

    it('lets no emotion, stress or advice through by another name', () => {
        const text = JSON.stringify(buildPost({ sleepImageUrl: url('sleep_images'), sleepAnalysis: FULL_ANALYSIS }));
        for (const leak of ['emotionTone', 'stressLevel', '차분함', '낮음', 'feedback', '조금 더 일찍']) {
            expect(text, leak).not.toContain(leak);
        }
    });

    it('sends no analysis without the picture it belongs to', () => {
        const post = buildPost({ meditationDone: true, sleepAnalysis: FULL_ANALYSIS });
        expect(post.sleepAndMind.sleepAnalysis).toBeUndefined();
    });

    it('draws the 분석 확인 button under the sleep picture, like diet', () => {
        const sleepBlock = APP.split('// 마음 미디어')[1].split('// 마음 텍스트')[0];
        expect(sleepBlock).toContain('gallery-ai-overlay-btn');
        expect(sleepBlock).toContain('data-ai-analysis');
    });

    it('keeps the exercise button too', () => {
        const exerciseBlock = APP.split('// 운동 미디어')[1].split('// 마음 미디어')[0];
        expect(exerciseBlock).toContain('gallery-ai-overlay-btn');
        expect(exerciseBlock).toContain('toggleGalleryAiOverlay');
    });
});

// 감사 일기는 3월~7월 10일 갤러리에 보였다(갤러리가 daily_logs 를 직접 읽던 때).
// 7월 11일 gallery_posts 로 옮기며 빠졌고, 2026-10-15 에 되돌린다.
describe('the gratitude journal is shared again', () => {
    it('goes out with the mind section', () => {
        const post = buildPost({ gratitude: '  가족과 저녁을 먹었다  ' });
        expect(post.sleepAndMind.gratitude).toBe('가족과 저녁을 먹었다');
    });

    it('is enough on its own to make a post', () => {
        // 사진도 명상도 없이 감사 일기만 쓴 날도 갤러리에 나간다.
        expect(buildPost({ gratitude: '감사' })).toBeTruthy();
    });

    it('stays out when the member hides the mind section', () => {
        const post = buildGalleryPostFromDailyLog({
            logId: 'u1_2026-09-16',
            dailyLog: { userId: 'u1', userName: '테스트', date: '2026-09-16', shareSettings: { hideMind: true }, sleepAndMind: { gratitude: '비밀' } },
            updatedAt: new Date(),
            allowedStorageBuckets: [BUCKET],
        });
        expect(JSON.stringify(post || {})).not.toContain('비밀');
    });

    it('is capped at 500 characters', () => {
        expect(buildPost({ gratitude: '가'.repeat(900) }).sleepAndMind.gratitude).toHaveLength(500);
    });

    it('tells the writer, under the journal, that it is shared', () => {
        const html = readFileSync(resolve(ROOT_DIR, 'index.html'), 'utf8');
        const after = html.split('id="gratitude-journal"')[1].slice(0, 400);
        expect(after).toContain('갤러리에 함께 공개돼요');
        expect(html).toContain('<span>마음·AI 분석</span>');
    });
});

// 어제 이 번호를 클라이언트에서만 3 으로 올렸다. 서버는 게시물마다 2 를 찍으므로,
// 그대로 배포했으면 모든 게시물이 번호 불일치로 걸러져 영구 캐시가 통째로 죽었을
// 것이다 — 갤러리는 매번 처음부터 다시 받았을 것이고, 화면은 멀쩡해 보였을 것이다.
describe('the cached post version matches what the server stamps', () => {
    it('reads the same number on both sides', () => {
        const client = Number(APP.match(/const GALLERY_PERSISTED_POST_SCHEMA_VERSION = (\d+);/)[1]);
        expect(client).toBe(GALLERY_POST_SCHEMA_VERSION);
    });

    it('is the number the cache filter actually compares', () => {
        const filter = APP.split('function normalizePersistedGalleryLogs(')[1].split('\n}')[0];
        expect(filter).toContain('Number(item.data.schemaVersion) !== GALLERY_PERSISTED_POST_SCHEMA_VERSION');
    });
});
