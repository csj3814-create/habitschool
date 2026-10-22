import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(resolve(ROOT_DIR, 'js/app-core.js'), 'utf8');

// 2026-10-22 대표 제보: "see translation 누르니까 되돌리는 버튼이 안 나와".
// 갤러리를 새로 불러오면 캐시 속 글 객체가 바뀌는데, 받은 번역을 옛 객체에만 붙여 두었다.
// 원문 보기를 누르면 번역 없는 새 객체로 카드를 그려 단추가 사라지고 원문에 갇혔다.
describe('the translation toggle never strands a card in the original', () => {
    it('remembers received translations by post id, not on the cached object', () => {
        const remember = app.split('function rememberGalleryTranslations(')[1].split('\n}\n')[0];
        expect(remember).toContain('_galleryTranslationMemory.set(id, remembered)');
    });

    it('merges what it remembered when it builds a card', () => {
        const build = app.split('function buildGalleryCard(item, myId) {')[1].split('\n}\n')[0];
        expect(build).toContain('withRememberedTranslations(item)');
        // 번역이 하나도 없으면 원문 상태를 풀어, 단추 없이 원문만 남지 않게 한다.
        expect(build).toContain('_galleryOriginalPostIds.delete(item.id)');
    });

    it('uses the same memory for comments and for deciding whether to ask again', () => {
        expect(app).toContain('getValidTranslations({ ...withRememberedTranslations(cachedItem), comments }');
        expect(app).toContain('pendingTranslationFields(withRememberedTranslations(item), locale)');
    });
});
