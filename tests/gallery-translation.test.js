// 갤러리 자동 번역 (해외 3단계 E5-2, 2026-10-21 대표: 처음 볼 때 번역해 저장 · AI 분석·감사 일기·댓글).
// 번역은 칸마다 원문 지문과 함께 저장되고, 원문이 바뀌거나 칸이 없어지면 버려진다 — 숨긴 글·지운 댓글의 번역이 남으면 안 된다.

import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readRawRepoFile } from './source-helpers.js';
import * as client from '../js/gallery-translation.js';

const require = createRequire(import.meta.url);
const server = require('../functions/gallery-translation.js');
const gallery = require('../functions/gallery-posts.js');

const POST = {
    userId: 'u1',
    userName: '최석재',
    dietAnalysis: {
        lunch: { grade: 'B', summary: '채소가 많은 한 끼예요.', foods: [{ name: '현미밥', category: 'natural' }, { name: 'Salad', category: 'natural' }] },
    },
    exercise: { cardioList: [{ mediaId: 'cardio-1', imageUrl: 'x', aiAnalysis: { intensity: '중강도', feedback: '꾸준히 걸었어요.' } }] },
    sleepAndMind: { gratitude: '오늘도 감사해요', sleepAnalysis: { type: 'sleep', grade: 'A', summary: 'Slept well', details: { sleepDuration: '7시간' } } },
    comments: [{ id: 'c1', userId: 'u2', userName: 'Amy', text: 'Great job!' }, { id: 'c2', userId: 'u3', userName: '민수', text: '멋져요' }],
};

describe('브라우저용과 서버용 모듈은 같은 내용이다', () => {
    it('export 표기만 다르다', () => {
        const strip = (source) => source
            .replace(/^\/\/.*$/gm, '')
            .replace(/^export /gm, '')
            .replace(/\nmodule\.exports = \{[\s\S]*?\};\n?$/, '')
            .replace(/\s+/g, ' ')
            .trim();
        expect(strip(readRawRepoFile('functions/gallery-translation.js'))).toBe(strip(readRawRepoFile('js/gallery-translation.js')));
    });

    it('두 쪽 결과가 같다', () => {
        expect(server.hashText('감사해요')).toBe(client.hashText('감사해요'));
        expect(server.collectGalleryTranslatableFields(POST)).toEqual(client.collectGalleryTranslatableFields(POST));
        expect(server.pendingTranslationFields(POST, 'en')).toEqual(client.pendingTranslationFields(POST, 'en'));
    });
});

describe('번역할 칸 고르기', () => {
    it('AI 분석·음식 이름·감사 일기·댓글을 고르고 닉네임은 뺀다', () => {
        const keys = client.collectGalleryTranslatableFields(POST).map((field) => field.key);
        expect(keys).toEqual(expect.arrayContaining([
            'dietAnalysis|lunch|summary', 'dietAnalysis|lunch|foods|0', 'exercise|cardioList|cardio-1|feedback',
            'sleep|summary', 'sleep|sleepDuration', 'gratitude', 'comment|c1', 'comment|c2',
        ]));
        expect(keys.join(' ')).not.toContain('userName');
    });

    it('영어 화면은 한글 글을, 한국어 화면은 영어 글을 번역한다', () => {
        const en = client.pendingTranslationFields(POST, 'en').map((field) => field.key);
        const ko = client.pendingTranslationFields(POST, 'ko').map((field) => field.key);
        expect(en).toContain('gratitude');
        expect(en).toContain('comment|c2');
        expect(en).not.toContain('comment|c1');
        expect(ko).toContain('comment|c1');
        expect(ko).toContain('sleep|summary');
        expect(ko).not.toContain('gratitude');
    });
});

describe('지문이 맞는 번역만 쓴다', () => {
    const withTranslations = {
        ...POST,
        translations: { en: {
            gratitude: { s: client.hashText('오늘도 감사해요'), t: 'Thankful again today' },
            'comment|c2': { s: client.hashText('예전 댓글'), t: 'Old comment' },
        } },
    };

    it('원문이 바뀐 칸의 번역은 버린다', () => {
        expect(client.getValidTranslations(withTranslations, 'en')).toEqual({ gratitude: 'Thankful again today' });
        expect(client.pendingTranslationFields(withTranslations, 'en').map((field) => field.key)).not.toContain('gratitude');
    });

    it('번역을 끼운 사본을 만들고 원문 글은 그대로 둔다', () => {
        const view = client.applyGalleryTranslations(POST, { gratitude: 'Thankful again today', 'comment|c2': 'Awesome', 'dietAnalysis|lunch|foods|0': 'Brown rice' });
        expect(view.sleepAndMind.gratitude).toBe('Thankful again today');
        expect(view.comments[1].text).toBe('Awesome');
        expect(view.dietAnalysis.lunch.foods[0].name).toBe('Brown rice');
        expect(POST.sleepAndMind.gratitude).toBe('오늘도 감사해요');
        expect(POST.comments[1].text).toBe('멋져요');
    });

    it('지금 글에 없는 칸(숨긴 감사 일기·지운 댓글)의 번역은 남기지 않는다', () => {
        const hidden = { ...POST, sleepAndMind: { ...POST.sleepAndMind, gratitude: '' }, comments: [POST.comments[0]] };
        const translations = { en: {
            gratitude: { s: client.hashText('오늘도 감사해요'), t: 'Thankful again today' },
            'comment|c2': { s: client.hashText('멋져요'), t: 'Awesome' },
        } };
        expect(client.pruneGalleryTranslations(translations, hidden)).toBeNull();
        expect(client.pruneGalleryTranslations(translations, POST)).toEqual(translations);
    });
});

describe('서버', () => {
    it('글을 다시 만들 때 맞는 번역만 따라간다', () => {
        const existingPost = {
            comments: POST.comments,
            translations: { en: { 'comment|c2': { s: client.hashText('멋져요'), t: 'Awesome' }, gratitude: { s: client.hashText('옛 감사'), t: 'Old' } } },
        };
        const post = gallery.buildGalleryPostFromDailyLog({
            logId: 'u1_2026-10-21',
            dailyLog: { userId: 'u1', userName: 'A', date: '2026-10-21', sleepAndMind: { gratitude: '오늘도 감사해요', meditationDone: true } },
            existingPost,
        });
        expect(post.translations).toEqual({ en: { 'comment|c2': { s: client.hashText('멋져요'), t: 'Awesome' } } });
    });

    it('번역 함수는 gemini-2.5-flash 를 생각 없이 부르고, 댓글을 지우면 그 번역도 지운다', () => {
        const runtime = readRawRepoFile('functions/runtime.js');
        const fn = runtime.split('exports.translateGalleryPost = onCall(')[1].split('\n);\n')[0];
        expect(fn).toContain('model: "gemini-2.5-flash"');
        expect(fn).toContain('thinkingConfig: { thinkingBudget: 0 }');
        expect(fn).toContain('pendingTranslationFields(post, locale)');
        const del = runtime.split('exports.deleteGalleryComment = onCall(')[1].split('\n);\n')[0];
        expect(del).toContain('pruneGalleryTranslations(');
        expect(del).toContain('tx.update(postRef, { comments: nextComments, translations:');
    });
});

describe('화면', () => {
    it('카드는 번역을 끼워 그리고, 없으면 한 번 부탁하고, 원문 보기를 둔다', () => {
        const app = readRawRepoFile('js/app-core.js');
        const card = app.split('function buildGalleryCard(item, myId) {')[1].split('\n}\n')[0];
        expect(card).toContain('applyGalleryTranslations(item.data, availableTranslations)');
        expect(card).toContain('scheduleGalleryTranslation(item, translationLocale)');
        expect(card).toContain("onclick=\"toggleGalleryOriginal('${safeDocId}')\"");
        expect(app).toContain("httpsCallable(functions, 'translateGalleryPost')({ postId: item.id, locale })");
        expect(readRawRepoFile('sw.js')).toContain("'./js/gallery-translation.js?v=");
    });
});

describe('2026-10-21 대표 확인 뒤 고친 것', () => {
    it('번역 보기·원문 보기를 눌러도 펼친 사진·분석과 보던 자리가 그대로다', () => {
        const app = readRawRepoFile('js/app-core.js');
        const fn = app.split('function rerenderGalleryCard(item) {')[1].split('\n}\n')[0];
        expect(fn).toContain("overlayOpen: wrapper.querySelector('.gallery-ai-overlay')?.style.display === 'block'");
        expect(fn).toContain("wrapper.querySelector('.gallery-ai-overlay-btn')?.click()");
        expect(fn).toContain('window.scrollBy(0, nextTop - anchorTop)');
    });

    it('세로 사진은 펼쳐도 높이가 칸 너비를 넘지 않는다(최대 1:1)', () => {
        const css = readRawRepoFile('styles-reports.css');
        expect(css).toMatch(/\.gallery-media-wrapper:has\(img\.gallery-img-expanded\) \{[^}]*container-type: inline-size;/);
        expect(css).toMatch(/\.gallery-media-wrapper img\.gallery-img-expanded \{[^}]*max-height: 100cqw !important;[^}]*object-fit: contain !important;/);
    });

    it('영어 미량 영양소 이름은 한 줄에 들어가게 줄인다', async () => {
        const { EN_MESSAGES } = await import('../js/i18n-en.js');
        expect(EN_MESSAGES['diet.score.antioxidants']).toBe('Antiox.');
    });
});
