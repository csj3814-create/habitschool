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
        expect(appSource).toContain('const GALLERY_USER_FILTER_TIMEOUT_MS = 15000;');
        // 기록이 하나도 없는 회원이면 영원히 돌지 않게 끊고 알려 준다.
        expect(appSource).toContain("showToast('이 회원의 갤러리 기록을 찾지 못했어요.');");
        // 이름은 URL이 아니라 이미 받아 온 데이터에서 꺼낸다.
        expect(applyFn).toContain("String(match.data.userName || '회원').trim()");
        // 적용되면 스스로 비운다. 안 그러면 setGalleryUserFilter가 부르는 렌더에서
        // 무한히 되풀이된다.
        expect(applyFn).toContain("_pendingGalleryUserFilter = '';");
        // 주소도 정리한다. 새로고침마다 필터가 되살아나면 빠져나오기 어렵다.
        expect(applyFn).toContain("url.searchParams.delete('galleryUser');");
    });

    it('only accepts a uid-shaped value from the URL', () => {
        const appSource = readAppSource();

        expect(appSource).toContain('function readGalleryUserFilterFromUrl()');
        expect(appSource).toContain('/^[A-Za-z0-9_-]{6,128}$/.test(raw)');
        expect(appSource).toContain('applyPendingGalleryUserFilter();');
    });
});
