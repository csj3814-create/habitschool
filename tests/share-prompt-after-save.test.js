import { describe, expect, it } from 'vitest';
import { readAppSource, readRepoFile } from './source-helpers.js';

// 공유 카드는 갤러리 탭 안에만 있어서, 가장 공유하고 싶은 순간(방금 저장했을 때)에는
// 탭을 옮겨 카드를 찾아야 했다. 저장 직후 한 번의 탭으로 공유 시트까지 가게 한다.
describe('share prompt right after saving', () => {
    it('offers the share sheet in one tap from the save moment', () => {
        const appSource = readAppSource();
        const markup = readRepoFile('index.html');

        expect(markup).toContain('id="share-after-save-sheet"');
        expect(appSource).toContain('window.acceptShareAfterSave = function ()');
        expect(appSource).toContain("if (window.openTab) window.openTab('gallery');");
        expect(appSource).toContain('window.shareMyCard?.();');
        expect(appSource).toContain('maybeShowShareAfterSave({');
    });

    // 조르면 오히려 공유를 피하게 된다. 이 네 가지 차단 조건이 핵심이다.
    it('stays quiet when there is nothing worth sharing or it already asked', () => {
        const appSource = readAppSource();
        // 함수 본문만 떼어낸다. 인자 구조분해에도 '\n}'가 있어 다음 함수 선언을 경계로 쓴다.
        const promptFn = appSource
            .split('function maybeShowShareAfterSave(')[1]
            ?.split('function hideShareAfterSaveSheet(')[0] || '';

        expect(promptFn).not.toBe('');
        // 업로드가 실패한 저장은 카드가 비어 보인다.
        expect(promptFn).toContain('if (!user?.uid || hadUploadFailures) return false;');
        // 첫 기록 결과 모달이 뜬 순간은 이미 다른 안내가 차지했다.
        expect(promptFn).toContain('if (firstResultShown) return false;');
        // 지난 날짜 기록을 오늘 공유하자고 권하지 않는다.
        expect(promptFn).toContain('if (!dateStr || dateStr !== getKstDateString()) return false;');
        // 하루 한 번.
        expect(promptFn).toContain('if (hasShownShareAfterSaveToday(user.uid)) return false;');
        // 사진이 없으면 카드가 플레이스홀더뿐이다.
        expect(promptFn).toContain('if (!collectShareCardMedia(savedLog, getDefaultShareSettings()).length) return false;');
        // 하루 한 번 제한은 KST 날짜 기준이어야 자정 경계가 기기 시간대와 어긋나지 않는다.
        expect(appSource).toContain("localStorage.getItem(getShareAfterSavePromptKey(uid)) === getKstDateString()");
    });

    it('attributes shares that started from the prompt', () => {
        const appSource = readAppSource();

        expect(appSource).toContain("_shareEntryPointOverride = 'record_prompt';");
        expect(appSource).toContain('const resolvedEntryPoint = _shareEntryPointOverride || entryPoint;');
        // 모달을 여는 중간 단계(deferred)에서는 출처를 유지해야 실제 공유까지 이어진다.
        expect(appSource).toContain("if (status !== 'deferred') _shareEntryPointOverride = '';");
        expect(appSource).toContain("trackProductEvent('share_prompt_shown', {");
    });
});
