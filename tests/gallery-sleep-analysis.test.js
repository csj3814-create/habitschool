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

// 2026-09-17 에 갤러리 투영에 수면 분석을 실었다가, 2026-09-18 에 다시 뺐다.
//
//   "백필은 하지 않아도 되겠고 그럼 수면 분석은 AI 분석 확인을 빼는 게 낫겠는데?"
//
// 갤러리는 남들이 보는 자리다. 수면 캡처를 공유하는 것과 "이 사람의 수면은 B 등급"
// 이라는 AI 판단을 함께 거는 것은 다른 일이다. 회원 본인 화면에서는 그대로 본다.
//
// 이 시험은 그 결정을 못 박는다. 되살리는 건 언제든 되지만, 실수로 다시 새어
// 나가지는 않게 한다.
describe('the gallery leaves the sleep analysis out on purpose', () => {
    it('keeps it out of the post even when the record has one', () => {
        const post = buildPost({ sleepImageUrl: url('sleep_images'), sleepAnalysis: FULL_ANALYSIS });
        expect(post.sleepAndMind).toBeTruthy();
        expect(post.sleepAndMind.sleepAnalysis).toBeUndefined();
    });

    it('lets nothing from the analysis through by another name', () => {
        // 등급·요약·감정·스트레스 어느 것도 다른 칸에 묻어 나가면 안 된다.
        const text = JSON.stringify(buildPost({ sleepImageUrl: url('sleep_images'), sleepAnalysis: FULL_ANALYSIS }));
        for (const leak of ['sleepAnalysis', '6시간 50분', '차분함', '낮음', '조금 더 일찍']) {
            expect(text, leak).not.toContain(leak);
        }
    });

    it('still sends the picture and the meditation flag', () => {
        // 뺀 것은 분석뿐이다. 수면 칸 자체는 그대로 나간다.
        const post = buildPost({ sleepImageUrl: url('sleep_images'), meditationDone: true, sleepAnalysis: FULL_ANALYSIS });
        expect(post.sleepAndMind.sleepImageUrl).toContain('sleep_images');
        expect(post.sleepAndMind.meditationDone).toBe(true);
    });

    it('draws no 분석 확인 button under the sleep picture', () => {
        const sleepBlock = APP
            .split("alt=\"수면 기록 캡처\"")[0]
            .split('// 마음 미디어')[1];
        expect(sleepBlock).toBeTruthy();
        expect(sleepBlock).not.toContain('gallery-ai-overlay-btn');
        expect(sleepBlock).not.toContain('data-ai-analysis');
    });

    it('leaves the exercise button alone — that one stays', () => {
        // 운동은 09-15 부터 실려 나가고 화면에도 버튼이 있다. 이번 결정과 무관하다.
        const exerciseBlock = APP.split('// 운동 미디어')[1].split('// 마음 미디어')[0];
        expect(exerciseBlock).toContain('gallery-ai-overlay-btn');
        expect(exerciseBlock).toContain('toggleGalleryAiOverlay');
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
