import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 2026-10-15 제보: "갤러리 탭에서 운동 영상도 식단 기록처럼 아래에 분석 보기 누를 수 있게
// 버튼 보여줘. 지금은 영상 눌러서 들어가야 분석 보기 버튼이 보이고 있어."
//
// 버튼은 그려지고 있었다. 영상 칸 전체가 정사각형(aspect-ratio 1/1, overflow hidden)
// 이라 그 아래 붙은 버튼이 잘렸고, 재생하면 틀이 풀려서 그때야 보였다.
const app = readRepoFile('js/app-core.js');
const css = readRepoFile('styles-features.css');

describe('갤러리 운동 영상의 분석 확인 버튼', () => {
    const addVid = app.slice(app.indexOf('const addVid = (url, thumbUrl, aiAnalysis) => {'), app.indexOf('addImg(data.exercise.cardioImageUrl'));

    it('정사각형으로 자르는 것은 화면 틀만이고, 버튼은 틀 밖에 있다', () => {
        expect(addVid).toContain('<div class="video-thumb-frame">');
        const frame = addVid.slice(addVid.indexOf('<div class="video-thumb-frame">'));
        const frameEnd = frame.indexOf('</div>\n                    </div>');
        expect(frameEnd).toBeGreaterThan(-1);
        // 재생 버튼은 틀 안, 분석 버튼(aiBtn)은 틀이 닫힌 뒤
        expect(frame.slice(0, frameEnd)).toContain('video-play-btn');
        expect(frame.slice(frameEnd)).toContain('${aiBtn}');
    });

    it('분석이 있는 영상 칸은 칸 전체를 자르지 않는다', () => {
        expect(addVid).toContain("video-thumb-wrapper${hasAi ? ' has-ai' : ''}");
        expect(css).toMatch(/\.video-thumb-wrapper\.has-ai \{\s*aspect-ratio: auto;\s*overflow: visible;/);
        expect(css).toMatch(/\.video-thumb-wrapper\.has-ai \.video-thumb-frame \{\s*aspect-ratio: 1 \/ 1;/);
    });

    it('재생하면 영상이 재생 버튼이 있는 자리(틀 안)에 들어간다 — 소모임 인증 칸도 그대로', () => {
        const play = app.slice(app.indexOf('window.playGalleryVideo = function (wrapper) {'), app.indexOf('// 갤러리 이미지 인라인 확대/축소 토글.'));
        expect(play).toContain('(playBtn?.parentNode || wrapper).insertBefore(video, playBtn || null);');
        expect(css).toMatch(/\.video-thumb-wrapper\.playing \.video-thumb-frame \{\s*aspect-ratio: auto;/);
    });
});
