// 영어 앱 갤러리 (해외 3단계 E5-1, 2026-10-21). 화면 틀을 영어로 열고, 남의 글(AI 분석·감사 일기·댓글)은
// E5-2 자동 번역 전까지 원문 그대로다. 영어 감사 일기는 공개 안내가 운영에 나간 날부터만 싣는다(대표 결정).

import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readRawRepoFile, readRepoFile } from './source-helpers.js';
import { getAllowedTabsForRoute, getRouteContext } from '../js/app-mode.js';

const require = createRequire(import.meta.url);
const gallery = require('../functions/gallery-posts.js');

const HANGUL = /[가-힣]/;
const EN_INDEX = readRepoFile('en/index.html');
const EN_CSS = readRepoFile('styles-en.css').replace(/\/\*[\s\S]*?\*\//g, '');
const APP = readRawRepoFile('js/app-core.js');

describe('영어 앱에 갤러리 탭이 열린다', () => {
    it('탭 목록과 탭 단추', () => {
        expect(getAllowedTabsForRoute(getRouteContext('/en'))).toContain('gallery');
        expect(EN_INDEX).toMatch(/data-i18n="tab\.galleryLabel">✨ Gallery<\/button>/);
        expect(EN_CSS).not.toMatch(/html\.locale-en #gallery[,\s{]/);
        expect(EN_CSS).not.toContain('html.locale-en #gratitude-public-note');
    });

    it('영어 갤러리 구역에서 보이는 정적 글자에 한글이 없다', () => {
        const from = EN_INDEX.indexOf('<div id="gallery" class="content-section"');
        const section = EN_INDEX.slice(from, EN_INDEX.indexOf('<div class="chat-banner-fixed"', from))
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/<script[\s\S]*?<\/script>/g, '');
        const text = section.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
        expect(text.split(' ').filter((w) => HANGUL.test(w))).toEqual([]);
        // 그림 설명은 화면이 열릴 때 바꾼다(js/i18n.js SELECTOR_ATTRS).
        const attrs = [...section.matchAll(/\s(?:placeholder|aria-label|alt)="([^"]*)"/g)].map((m) => m[1]).filter((v) => HANGUL.test(v));
        expect(attrs).toEqual(['공유 이미지 미리보기']);
        expect(readRawRepoFile('js/i18n.js')).toContain("['#share-render-preview', 'alt', 'Share image preview']");
    });

    it('카카오 단톡방 대신 다른 언어는 텔레그램 방으로 간다', () => {
        expect(APP).toContain("const url = getLocale() === 'ko' ? COMMUNITY_CHAT_URL : ENGLISH_COMMUNITY_URL;");
    });
});

describe('영어 감사 일기 공개 (2026-10-21 대표: 안내가 운영에 나간 날부터)', () => {
    it('공개 시작일은 비어 있거나(아직 아님) 결정한 날 이후다', () => {
        expect(gallery.GRATITUDE_EN_PUBLIC_FROM === '' || (/^\d{4}-\d{2}-\d{2}$/.test(gallery.GRATITUDE_EN_PUBLIC_FROM) && gallery.GRATITUDE_EN_PUBLIC_FROM >= '2026-10-21')).toBe(true);
    });

    it('공개 시작일 전에 쓴 영어 감사 일기는 싣지 않는다', () => {
        const build = (gratitudeLocale, date) => gallery.buildGalleryPostFromDailyLog({
            logId: `u1_${date}`,
            dailyLog: {
                userId: 'u1', userName: 'A', date, gratitudeLocale,
                sleepAndMind: { gratitude: 'Thankful today', meditationDone: true },
            },
        });
        const enBefore = build('en', '2026-10-20');
        expect(enBefore?.sleepAndMind?.gratitude || '').toBe('');
        const ko = build('ko', '2026-10-20');
        expect(ko?.sleepAndMind?.gratitude).toBe('Thankful today');
        if (gallery.GRATITUDE_EN_PUBLIC_FROM) {
            expect(build('en', gallery.GRATITUDE_EN_PUBLIC_FROM)?.sleepAndMind?.gratitude).toBe('Thankful today');
        } else {
            expect(build('en', '2099-01-01')?.sleepAndMind?.gratitude || '').toBe('');
        }
    });
});
