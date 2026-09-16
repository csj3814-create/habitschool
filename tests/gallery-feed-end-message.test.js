import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(resolve(ROOT_DIR, 'js/app-core.js'), 'utf8');
const REST_FALLBACK = APP
    .split('async function _applyGalleryRestFallback(cutoffStr, audience = \'auth\', limitCount = GALLERY_REST_FALLBACK_LIMIT) {')[1]
    .split('\n}')[0];

// 2026-09-16 제보: "여기까지가 전체기록이에요 라고 나와요" (갤러리 탭)
//
// 그날 gallery_posts 는 900건이 넘었고 7월치까지 있었다(측정:
// scripts/count-gallery-posts-2026-09-16.js). "전체" 일 수가 없었다.
//
// 원인은 REST 폴백이었다. Firestore SDK 가 로컬 캐시 스냅샷을 돌려주면
// (metadata.fromCache — 앱을 다시 열 때 흔하다) 코드가 조용히 REST 로 최대
// 300건을 받아 오는데, 그 함수가 galleryHasMore 만 끄고 끝냈다. 화면은 그것을
// '더 없음' 으로 읽었다. 그 경로는 경고 로그도 남기지 않아 제보의
// consoleEntries 가 비어 있었다.
describe('the feed says why it stopped, not just that it stopped', () => {
    it('calls the REST fallback a cap, because that is what it is', () => {
        // 300건만 받아 놓고 '전체' 라고 하면 회원은 나머지가 없다고 믿는다.
        expect(REST_FALLBACK).toContain('galleryHasMore = false;');
        expect(REST_FALLBACK).toContain('galleryReachedCap = true;');
    });

    it('keeps the two endings apart in the message itself', () => {
        const fn = APP.split('function _setGalleryFeedEnd(show) {')[1].split('\n}')[0];
        expect(fn).toContain('galleryReachedCap');
        expect(fn).toContain('여기까지가 최근 기록이에요');
        expect(fn).toContain('여기까지가 전체 기록이에요');
        // 상한 문구가 먼저 걸려야 한다 — 뒤에 있으면 영영 안 나온다.
        expect(fn.indexOf('galleryReachedCap')).toBeLessThan(fn.indexOf('여기까지가 전체 기록이에요'));
    });

    it('cannot page past the REST fallback, and admits it', () => {
        // REST 응답으로는 Firestore 커서를 만들 수 없다. 그래서 여기서 끝나는 것
        // 자체는 맞다 — 틀린 것은 그것을 '전체' 라고 부른 것이었다.
        expect(REST_FALLBACK).toContain('galleryLastDoc = null;');
        expect(APP).toContain('const GALLERY_REST_FALLBACK_LIMIT = 300;');
    });

    it('still says "all of it" when the feed really did run out', () => {
        // SDK 경로에서 짧은 페이지가 오면 그때는 정말 끝이다.
        const loadMore = APP.split('async function _loadMoreGalleryFromFirestore() {')[1].split('\n}')[0];
        expect(loadMore).toContain('galleryHasMore = snapshot.size >= FIRESTORE_PAGE_SIZE');
        expect(loadMore).toContain('galleryReachedCap = getGlobalGalleryCacheSize() >= MAX_CACHE_SIZE');
    });

    it('resets the cap flag when the feed is rebuilt', () => {
        // 한 번 켜진 채로 남으면 다음 로드에서 '최근 기록' 이 잘못 뜬다.
        expect(APP).toContain('galleryReachedCap = false;');
    });
});
