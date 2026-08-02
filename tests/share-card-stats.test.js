import { describe, expect, it } from 'vitest';
import { readAppSource } from './source-helpers.js';

// 카드에 실려 있던 성취는 오른쪽 위 작은 포인트 칩 하나뿐이었고, 그 자리를 식단·운동·마음
// 태그 칩이 차지하고 있었다. 그 태그는 아래 사진 타일마다 이미 붙어 있어 중복이었다.
// SNS에서 눈에 띄는 건 "무엇을 기록했나"가 아니라 "얼마나 해냈나"다.
describe('share card achievement numbers', () => {
    it('replaces the duplicated category tags with a stat band', () => {
        const appSource = readAppSource();

        expect(appSource).toContain('function drawSharePosterStatBand(');
        expect(appSource).toContain('drawSharePosterStatBand(ctx, latest, settings);');
        // 사진 타일마다 카테고리 칩을 그리는 코드는 그대로 남아 있어야 한다.
        expect(appSource).toContain("drawCanvasChip(ctx, frame.x + 14, frame.y + frame.h - 48, item?.category || '기록'");
        // 헤더의 태그 칩 줄과 중복 포인트 칩은 사라진다.
        expect(appSource).not.toContain('tags.slice(0, 4).forEach((tag) => {');
        expect(appSource).not.toContain('`Ⓟ ${getSharePoints(latest)}P`');
    });

    it('only uses numbers that live on the record being shared', () => {
        const appSource = readAppSource();
        const statsFn = appSource
            .split('function collectSharePosterStats(')[1]
            ?.split('function drawSharePosterStatBand(')[0] || '';

        expect(statsFn).not.toBe('');
        expect(statsFn).toContain('const streak = Math.max(0, Number(latest.currentStreak) || 0);');
        expect(statsFn).toContain("const doneCount = ['diet', 'exercise', 'mind'].filter((key) => awarded[key]).length;");
        // 주간 완주율은 갤러리 캐시로만 구할 수 있는데, 갤러리는 '공유된 기록'만 담아
        // 비공개로 기록한 날이 빠진다. 공개 카드에 실제보다 낮은 숫자를 박으면 안 된다.
        expect(statsFn).not.toContain('cachedGalleryLogs');
        expect(statsFn).not.toContain('weekStrs');
    });

    it('leaves out a stat rather than printing a meaningless zero', () => {
        const appSource = readAppSource();
        const statsFn = appSource
            .split('function collectSharePosterStats(')[1]
            ?.split('function drawSharePosterStatBand(')[0] || '';

        // 연속 0일, 0/3, 0P를 늘어놓으면 자랑이 아니라 실패 보고가 된다.
        expect(statsFn).toContain('if (streak > 0) stats.push(');
        expect(statsFn).toContain('if (doneCount > 0) stats.push(');
        expect(statsFn).toContain('if (points > 0) stats.push(');
        // 포인트 숨김 설정은 카드 전체에서 일관되게 지켜져야 한다.
        expect(statsFn).toContain('if (!settings.hidePoints) {');
        expect(appSource).toContain('if (!stats.length) return;');
    });
});
