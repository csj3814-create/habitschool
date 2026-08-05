import { describe, expect, it } from 'vitest';
import { readAppSource, readRepoFile } from './source-helpers.js';

// 관제탑에서 회원을 보다가 그 사람 기록만 갤러리에서 보려면, 갤러리에 들어가
// 카드를 찾아 이름을 눌러야 했다. 주소로 바로 열 수 있게 한다.
describe('admin can jump straight to one member\'s gallery', () => {
    it('links from the member modal without putting a name in the URL', () => {
        const admin = readRepoFile('admin.html');

        expect(admin).toContain('id="modal-gallery-link"');
        expect(admin).toContain('galleryUser=${encodeURIComponent(uid)}#gallery');
        // 이름은 주소에 싣지 않는다. 개인정보를 주소창·방문기록에 남길 이유가 없다.
        expect(admin).not.toContain('galleryUserName=');
    });

    it('applies the filter once the gallery actually has that person\'s posts', () => {
        const appSource = readAppSource();
        const applyFn = appSource
            .split('function applyPendingGalleryUserFilter() {')[1]
            ?.split('\n}')[0] || '';

        expect(applyFn).not.toBe('');
        // 갤러리 데이터가 도착하는 경로가 여러 갈래라, 한 렌더 함수에 걸어 두면
        // 그 함수를 안 타는 경로에서 조용히 놓친다. 직접 확인하며 기다린다.
        expect(applyFn).toContain('startGalleryUserFilterPoll();');
        // 글이 오기를 기다리는 동안 전체 피드가 보이면 안 된다. 필터부터 걸고
        // 이름만 나중에 채운다.
        expect(applyFn).toContain("window.setGalleryUserFilter(_pendingGalleryUserFilter, '불러오는 중…');");
        expect(appSource).toContain('const GALLERY_USER_FILTER_TIMEOUT_MS = 15000;');
        // 기록이 하나도 없는 회원이면 영원히 돌지 않게 끊는다. 이때 필터를 안 걸면
        // 전체 피드가 보여서 어느 회원을 보러 온 건지 알 수 없다. 글이 없다는 사실
        // 자체가 보러 온 정보이므로, 걸어서 빈 화면을 보여 준다.
        expect(appSource).toContain("window.setGalleryUserFilter(userId, '선택한 회원');");
        expect(appSource).toContain("showToast('이 회원은 아직 갤러리에 올린 기록이 없어요.');");
        // 두 경로 모두 주소를 정리한다.
        expect(appSource).toContain('function clearGalleryUserFilterFromUrl()');
        // 이름은 URL이 아니라 이미 받아 온 데이터에서 꺼낸다.
        expect(applyFn).toContain("String(match.data.userName || '회원').trim()");
        // 적용되면 스스로 비운다. 안 그러면 setGalleryUserFilter가 부르는 렌더에서
        // 무한히 되풀이된다.
        expect(applyFn).toContain("_pendingGalleryUserFilter = '';");
        // 주소도 정리한다. 새로고침마다 필터가 되살아나면 빠져나오기 어렵다.
        expect(applyFn).toContain('clearGalleryUserFilterFromUrl();');
    });

    // 필터는 그 시점에 받아 둔 목록만 거른다. 첫 화면은 8건뿐이라 어제·오늘치만
    // 나오고, 그 사람의 지난 기록은 아직 도착하지도 않은 상태였다.
    it('pulls the remaining pages so the filtered view is not just today', () => {
        const appSource = readAppSource();
        const pullFn = appSource
            .split('async function loadRestOfGalleryForUserFilter() {')[1]
            ?.split('\n}')[0] || '';

        expect(pullFn).not.toBe('');
        // 전체 피드를 페이지 단위로 더 당기는 방식은 못 쓴다. 첫 화면이 로컬 캐시나
        // REST 폴백에서 그려지면 커서가 없어서 한 장도 못 가져온다.
        expect(pullFn).not.toContain('_loadMoreGalleryFromFirestore');
        expect(pullFn).toContain("where('userId', '==', targetId),");
        // orderBy를 빼야 복합 색인 없이 돈다. 정렬은 어차피 클라이언트에서 다시 한다.
        expect(pullFn).not.toContain('orderBy');
        expect(appSource).toContain('const GALLERY_USER_FILTER_FETCH_LIMIT = 200;');
        // 기다리는 사이 필터가 바뀌었으면 결과를 버린다.
        expect(pullFn).toContain('if (galleryUserFilter?.userId !== targetId) return;');
        // 한 사람 것만 모은 목록이라 전체 피드 캐시로 저장하면 안 된다.
        expect(pullFn).not.toContain('writePersistentGalleryCache');
        expect(appSource).toContain('loadRestOfGalleryForUserFilter();');
    });

    // 한 사람만 보는 화면에서 전체 기준 섹션은 읽을 이유가 없다. 특히 공유 카드는
    // '내' 카드라 남의 기록을 보는 중에 뜨면 엉뚱하다.
    it('hides the whole-feed sections while a member filter is on', () => {
        const appSource = readAppSource();

        expect(appSource).toContain("'gallery-hero',");
        expect(appSource).toContain("'my-share-container',");
        expect(appSource).toContain("'weekly-best-container'");
        // 가리기는 반드시 렌더가 끝난 뒤에 한다. 먼저 가려 두면 위쪽 렌더들이
        // 자기 display를 다시 설정하면서 도로 되살린다(그래서 필터 중엔 보이고,
        // 전체보기에서는 가려진 값이 '원래 값'으로 복원돼 영영 사라졌다).
        expect(appSource).toContain('applyGalleryFilterChrome(!!galleryUserFilter);');
        expect(appSource).not.toContain('applyGalleryFilterChrome(true);');
        expect(appSource).not.toContain('applyGalleryFilterChrome(false);');
        // 섹션마다 원래 표시 상태가 달라서, 되돌릴 때 무조건 보이게 하면 안 된다.
        expect(appSource).toContain('el.dataset.preFilterDisplay = el.style.display');
    });

    it('only accepts a uid-shaped value from the URL', () => {
        const appSource = readAppSource();

        expect(appSource).toContain('function readGalleryUserFilterFromUrl()');
        expect(appSource).toContain('/^[A-Za-z0-9_-]{6,128}$/.test(raw)');
        expect(appSource).toContain('applyPendingGalleryUserFilter();');
    });
});
