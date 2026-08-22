import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 갤러리를 아래로 내리다 보면 점 세 개만 돌고 더 안 불러오는 정체가 있었다.
// 원인이 세 개였고, 셋 다 "한 번 어긋나면 스스로 복구할 수 없는" 형태였다.
// 여기서 고정하는 것은 그 복구 경로들이다.
const app = readRepoFile('js/app-core.js');
const html = readRepoFile('index.html');

const sliceFn = (source, header) => {
    const start = source.indexOf(header);
    if (start < 0) return '';
    let depth = 0, started = false;
    for (let i = start; i < source.length; i++) {
        if (source[i] === '{') { depth++; started = true; }
        else if (source[i] === '}') { depth--; if (started && depth === 0) return source.slice(start, i + 1); }
    }
    return '';
};

describe('무한 스크롤 정체 방지', () => {
    const loadMore = sliceFn(app, 'async function loadMoreGalleryItems()');

    it('loadMoreGalleryItems 를 찾을 수 있다', () => {
        expect(loadMore).not.toBe('');
    });

    // 렌더 도중 게시물 하나가 예외를 던지면 isLoadingMore 가 true 로 굳고,
    // 이후 모든 호출이 첫 줄 가드에서 튕겨 피드가 영영 멈췄다.
    it('isLoadingMore 를 finally 에서 반드시 푼다', () => {
        expect(loadMore).toContain('finally');
        const finallyBlock = loadMore.slice(loadMore.indexOf('finally'));
        expect(finallyBlock).toContain('isLoadingMore = false');
    });

    it('예외를 삼키지 않고 실패 상태로 남긴다', () => {
        expect(loadMore).toContain('catch');
        expect(loadMore).toContain('_setGalleryLoadFailed(true)');
    });

    // IntersectionObserver 는 교차 "전환" 시점에만 콜백을 준다. 로딩이 헛돌아
    // 페이지 높이가 그대로면 sentinel 이 화면에 들어온 채 남고 다시는 안 불린다.
    it('로드가 끝나면 옵저버를 다시 붙인다', () => {
        expect(loadMore).toContain('_rearmGalleryObserver()');
        expect(sliceFn(app, 'function _rearmGalleryObserver()')).toContain('setupInfiniteScroll()');
    });

    // 실패해도 galleryHasMore 가 true 로 남아 같은 실패를 무한 재귀로 반복하며
    // Firestore 를 두드렸다.
    it('무한 재귀 대신 상한 있는 루프를 쓴다', () => {
        expect(app).toContain('GALLERY_MAX_CHAINED_PAGES');
        expect(loadMore).toContain('GALLERY_MAX_CHAINED_PAGES');
        // 자기 자신을 다시 호출하는 형태가 남아 있으면 안 된다
        expect(loadMore).not.toMatch(/loadMoreGalleryItems\(\)\s*;/);
    });
});

describe('미리 불러오기', () => {
    it('바닥에 닿기 한참 전에 로드를 시작한다', () => {
        expect(app).toContain("GALLERY_PRELOAD_MARGIN = '1000px'");
        expect(sliceFn(app, 'function setupInfiniteScroll()')).toContain('rootMargin: GALLERY_PRELOAD_MARGIN');
        // 100px 로 되돌아가면 스크롤이 조금만 빨라도 스피너를 먼저 보게 된다
        expect(app).not.toContain("rootMargin: '100px'");
    });

    it('한 번에 붙이는 개수를 6개보다 늘렸다', () => {
        const m = app.match(/const LOAD_MORE = (\d+)/);
        expect(m).not.toBeNull();
        expect(Number(m[1])).toBeGreaterThanOrEqual(12);
    });
});

describe('실패 시 더보기 버튼', () => {
    it('sentinel 안에 재시도 블록이 있고 기본은 숨겨져 있다', () => {
        expect(html).toContain('id="gallery-load-retry"');
        const block = html.slice(html.indexOf('id="gallery-load-retry"'));
        expect(block.slice(0, 120)).toContain('display: none');
        expect(html).toContain('onclick="retryGalleryLoad()"');
    });

    it('retryGalleryLoad 가 전역에 있고 실패 상태를 풀고 다시 시도한다', () => {
        const fn = app.slice(app.indexOf('window.retryGalleryLoad ='));
        expect(fn).toContain('_setGalleryLoadFailed(false)');
        expect(fn).toContain('loadMoreGalleryItems()');
    });

    it('실패했을 때만 버튼을 띄우고 평소엔 스피너를 보여준다', () => {
        const fn = sliceFn(app, 'function _setGalleryLoadFailed(failed)');
        expect(fn).toContain('gallery-sentinel-spinner');
        expect(fn).toContain('gallery-load-retry');
    });

    it('필터를 바꾸거나 갤러리를 정리하면 실패 상태를 푼다', () => {
        expect(sliceFn(app, 'function renderFeedOnly()')).toContain('_setGalleryLoadFailed(false)');
        expect(sliceFn(app, 'function cleanupGalleryResources()')).toContain('_setGalleryLoadFailed(false)');
    });

    // 이 프로젝트의 다크모드는 opt-in body.dark-mode 다. prefers-color-scheme 로
    // 쓰면 다크모드를 켜도 버튼만 밝은 채로 남는다.
    it('다크모드를 프로젝트 방식으로 받는다', () => {
        const css = readRepoFile('styles-features.css');
        expect(css).toContain('body.dark-mode .gallery-load-retry-btn');
    });
});

describe('sentinel 노출 판단', () => {
    // 캐시만 보고 숨기면, 필터가 이번 장을 통째로 걸러냈을 때 Firestore 에 남은
    // 게 있어도 sentinel 이 사라져 무한 스크롤이 시작조차 안 된다.
    it('캐시 소진 여부만으로 sentinel 을 숨기지 않는다', () => {
        const bare = app.match(/if \(galleryDisplayCount >= sortedFilteredCache\.length\) \{\s*\n\s*sentinel\.style\.display = 'none';/g);
        expect(bare).toBeNull();
    });

    it('galleryHasMore 를 함께 본다', () => {
        const withFlag = app.match(/galleryDisplayCount >= sortedFilteredCache\.length && !galleryHasMore/g) || [];
        expect(withFlag.length).toBeGreaterThanOrEqual(3);
    });
});

describe('Firestore 페이지 로드', () => {
    const fetchFn = sliceFn(app, 'async function _loadMoreGalleryFromFirestore()');

    // 예전에는 catch 가 console.error 만 찍고 끝나서, 호출한 쪽이
    // "가져올 게 없다"와 "가져오지 못했다"를 구분할 수 없었다.
    it('성공·실패를 boolean 으로 돌려준다', () => {
        expect(fetchFn).toContain('return true');
        expect(fetchFn).toContain('return false');
        const catchBlock = fetchFn.slice(fetchFn.indexOf('} catch'));
        expect(catchBlock).toContain('return false');
    });
});
