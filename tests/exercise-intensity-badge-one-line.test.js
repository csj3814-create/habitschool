import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 2026-10-15 요청: 운동 분석의 "🏃 중강도" 배지가 두 줄로 꺾였다 — "아이콘 빼던지".
// 배지가 식단 등급(A·B…)용 42px 정사각형이라 아이콘과 세 글자가 들어가지 않았다.
const source = readRepoFile('js/diet-analysis.js');
const css = readRepoFile('styles-reports.css');

describe('운동 강도 배지는 한 줄', () => {
    const fn = source.slice(source.indexOf('export function renderExerciseAnalysisResult('));
    const badge = fn.slice(fn.indexOf('<div class="diet-grade-badge'), fn.indexOf('</div>', fn.indexOf('<div class="diet-grade-badge')));

    it('아이콘 없이 강도 글자만', () => {
        expect(badge).toContain('exercise-intensity-badge');
        expect(badge).toContain('${escapeHtml(displayIntensity)}');
        expect(badge).not.toMatch(/🏃|🚶|🔥|💥|intensityEmoji/);
    });

    it('정사각형이 아니라 글자만큼 넓히고 줄을 바꾸지 않는다', () => {
        const rule = css.slice(css.indexOf('.diet-grade-badge.exercise-intensity-badge {'));
        const body = rule.slice(0, rule.indexOf('}'));
        expect(body).toContain('width: auto;');
        expect(body).toContain('white-space: nowrap;');
    });
});
