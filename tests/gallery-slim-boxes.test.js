import { describe, expect, it } from 'vitest';
import { readAppSource } from './source-helpers.js';

// 2026-11-27 대표: "갤러리 내 게시물 반응 박스도 개선해 줘. 슬림하게 필요한 정보만. 그 아래 이번주
// 열심학생도 필요한 정보만. 그리고 이번주 열심학생 1,2,3위 누르면 그 사람 올린 갤러리만 뽑아서 보이게."
const APP = readAppSource();
const summary = APP.split('function renderActivitySummary(myId) {')[1].split('\n}\n')[0];
const weekly = APP.split("const container = document.getElementById('weekly-best-container');")[1].split('\n}\n')[0];

describe('갤러리 위 두 상자는 슬림하게', () => {
    it('내 게시물 반응: 한 줄 — 제목 · 받은 반응 · 받은 댓글, 설명 문단 없음', () => {
        expect(summary).toContain("summaryEl.classList.add('gallery-slim-box');");
        expect(summary).toContain('class="slim-row"');
        expect(summary).not.toContain('MY REACTIONS');
        expect(summary).not.toContain("t('gallery.myReactions.desc'");
        // 받은 댓글 창과 안 읽은 점은 그대로
        expect(summary).toContain('openGalleryActivitySheet()');
        expect(summary).toContain('id="gallery-activity-unread"');
    });

    it('이번 주 열심 학생: 순위 · 이름 · 점수만', () => {
        expect(weekly).toContain("container.classList.add('gallery-slim-box');");
        expect(weekly).not.toContain('WEEKLY SPOTLIGHT');
        expect(weekly).not.toContain("t('gallery.weekly.desc')");
        expect(weekly).toContain('class="slim-score"');
    });

    it('누르면 그 학생 기록만 — 이름을 숨긴 학생은 누를 수 없다', () => {
        expect(weekly).toContain("onclick=\"setGalleryUserFilter('${u.uid}'");
        expect(weekly).toContain('const canFilter = !u.anonymous && !!u.nameDate');
        expect(weekly).toContain('u.anonymous = !!item.data.shareSettings?.hideIdentity;');
        expect(weekly).toContain('weekly-slim-item is-static');
    });
});
