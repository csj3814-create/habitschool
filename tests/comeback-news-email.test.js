import { describe, expect, it } from 'vitest';
import emailModule from '../functions/reengagement-email.js';
import { readRepoFile } from './source-helpers.js';

const { buildComebackNewsEmailTemplate } = emailModule;

// 2026-09-30: 46~90일에 보낸 "보고 싶어요" 메일은 47명 중 기록한 분이 0명이었다.
// 91~180일에는 그동안 달라진 것을 적은 편지를 만든 사람 이름으로 보낸다.

describe('comeback news letter', () => {
    const letter = buildComebackNewsEmailTemplate({
        gapDays: 124, name: '해빛', appBaseUrl: 'https://habitschool.web.app', campaign: 'comeback_91_180'
    });

    it('comes from the person who built the app and says how long it has been', () => {
        expect(letter.subject).toBe('해빛님, 해빛스쿨 만든 최석재입니다');
        expect(letter.html).toContain('4개월 전');
        expect(letter.html).toContain('최석재 드림');
    });

    it('tags the link so a return from this mail can be counted', () => {
        expect(letter.html).toContain('https://habitschool.web.app/?utm_source=email&utm_medium=winback&utm_campaign=comeback_91_180');
    });

    it('offers only what exists and a way to stop', () => {
        expect(letter.html).toContain('1,400P');
        expect(letter.html).toContain('복귀 보너스 50P');
        expect(letter.html).toContain('답장만 주세요');
    });

    it('is picked by the 91-180 admin button', () => {
        expect(readRepoFile('admin.html')).toContain("sendComebackCampaign(91, 180, 'news')");
        expect(readRepoFile('functions/runtime.js')).toContain('const useNewsLetter = templateName === "news";');
    });
});
