import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 갤러리에서 한 회원만 보기로 걸면, 전체 피드 캐시에 없는 글까지 따로 조회해 온다.
// 그 조회에 두 가지 함정이 있었다.
const app = readRepoFile('js/app-core.js');

const sliceFn = (source, header) => {
    const start = source.indexOf(header);
    if (start < 0) return '';
    const bodyStart = source.indexOf(') {', start);
    if (bodyStart < 0) return '';
    let depth = 0;
    for (let i = bodyStart + 2; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') { depth--; if (depth === 0) return source.slice(start, i + 1); }
    }
    return '';
};

describe('회원 필터 조회 정렬', () => {
    const fn = sliceFn(app, 'async function loadRestOfGalleryForUserFilter()');

    it('함수를 찾을 수 있다', () => {
        expect(fn).not.toBe('');
    });

    // orderBy 가 없으면 Firestore 는 문서 ID 오름차순으로 준다. 문서 ID 가
    // `{uid}_{날짜}` 라서 한 사람 안에서는 날짜 오름차순이고, limit 에 걸리면
    // '가장 오래된 것부터' 채워서 최근 기록이 통째로 잘린다.
    it('최신순으로 가져온다 — limit 에 걸려도 최근 기록이 남아야 한다', () => {
        expect(fn).toContain("orderBy(documentId(), 'desc')");
    });

    it('여전히 그 회원 글만 조회한다', () => {
        expect(fn).toContain("where('userId', '==', targetId)");
        expect(fn).toContain('limit(GALLERY_USER_FILTER_FETCH_LIMIT)');
    });

    // updatedAt 정렬은 (userId, updatedAt) 복합 색인을 배포해야 동작한다.
    // documentId() 정렬은 equality 필터와 함께 자동 색인으로 동작해서 배포가 필요 없다.
    it('복합 색인이 필요한 정렬로 되돌아가지 않았다', () => {
        expect(fn).not.toContain("orderBy('updatedAt'");
        expect(fn).not.toContain("orderBy('date'");
    });

    it('documentId 가 import 되어 있다', () => {
        const importBlock = app.slice(0, app.indexOf('firebase-firestore.js'));
        expect(importBlock).toContain('documentId');
    });
});

describe('필터가 전체 피드 상한을 잡아먹지 않는다', () => {
    // 필터로 끌어온 글을 전체 피드 캐시에 그냥 합치면, 글 많은 회원을 한 번
    // 눌러 본 것만으로 전체 피드가 그만큼 일찍 끊긴다(상한 300).
    it('주입된 문서를 따로 기록한다', () => {
        const fn = sliceFn(app, 'async function loadRestOfGalleryForUserFilter()');
        expect(fn).toContain('galleryUserFilterInjectedIds.add(item.id)');
    });

    it('상한 계산에서 주입분을 뺀다', () => {
        expect(app).toContain('getGlobalGalleryCacheSize() >= MAX_CACHE_SIZE');
        // 예전처럼 통짜 length 로 재면 안 된다
        expect(app).not.toContain('cachedGalleryLogs.length >= MAX_CACHE_SIZE');
    });

    it('주입분이 없으면 전체 길이를 그대로 쓴다 — 불필요한 순회 없음', () => {
        const fn = sliceFn(app, 'function getGlobalGalleryCacheSize()');
        expect(fn).toContain('if (galleryUserFilterInjectedIds.size === 0) return cachedGalleryLogs.length;');
    });

    it('갤러리를 정리하면 기록도 비운다', () => {
        const fn = sliceFn(app, 'function cleanupGalleryResources()');
        expect(fn).toContain('galleryUserFilterInjectedIds = new Set()');
    });
});
