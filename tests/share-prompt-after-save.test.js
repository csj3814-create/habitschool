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
        // 사진이 없으면 카드가 플레이스홀더뿐이다.
        expect(promptFn).toContain('if (!collectShareCardMedia(savedLog, getDefaultShareSettings()).length) return false;');
        // 하루의 첫 저장 카드는 반쪽이다. 하루가 다 담겼을 때만 권한다.
        expect(promptFn).toContain('const reason = resolveShareWorthyReason(savedLog);');
        expect(promptFn).toContain('if (!reason) return false;');
        // 노출 횟수 제한.
        expect(promptFn).toContain('if (!canShowShareAfterSaveFor(user.uid, reason)) return false;');
        // 제한은 KST 날짜 기준이어야 자정 경계가 기기 시간대와 어긋나지 않는다.
        expect(appSource).toContain("if (!mark || mark.dateStr !== getKstDateString()) return true;");
    });

    // 아침에 식단 한 장 올린 카드를 내보내라고 권하면 보여 줄 게 없다.
    // 하루가 다 담긴 시점 — 풀 루틴을 채웠거나, 더 채울 일이 없는 저녁 — 에만 권한다.
    it('waits until the day is actually full before asking', () => {
        const appSource = readAppSource();
        const gateFn = appSource
            .split('function resolveShareWorthyReason(')[1]
            ?.split('function maybeShowShareAfterSave(')[0] || '';

        expect(gateFn).not.toBe('');
        expect(gateFn).toContain('if (getSharePoints(savedLog) >= DASHBOARD_DAILY_POINT_GOAL) return SHARE_PROMPT_REASON_FULL_ROUTINE;');
        expect(gateFn).toContain('if (Number.isFinite(kstHour) && kstHour >= SHARE_AFTER_SAVE_EVENING_HOUR) return SHARE_PROMPT_REASON_EVENING;');
        expect(appSource).toContain('const SHARE_AFTER_SAVE_EVENING_HOUR = 20;');
        expect(appSource).toContain('const DASHBOARD_DAILY_POINT_GOAL = 65;');
        // 저녁 판정은 기기 로컬 시간이 아니라 KST여야 한다. 해외 사용자의 저녁이
        // 한국의 저녁과 다르면 앱의 하루 경계와 어긋난다.
        expect(appSource).toContain("timeZone: 'Asia/Seoul',\n            hour: '2-digit',\n            hour12: false");
    });

    // 저녁에 한 번 권했는데 그 뒤 운동을 마저 채워 풀 루틴이 되면, 그때 비로소
    // 카드가 완성된다. 그 하루에 한해 한 번 더 권한다. 반대 순서는 허용하지 않는다.
    it('asks a second time only when the routine gets completed after an evening prompt', () => {
        const appSource = readAppSource();
        const guardFn = appSource
            .split('function canShowShareAfterSaveFor(')[1]
            ?.split('function markShareAfterSaveShown(')[0] || '';

        expect(guardFn).not.toBe('');
        expect(guardFn).toContain('return mark.reason === SHARE_PROMPT_REASON_EVENING && reason === SHARE_PROMPT_REASON_FULL_ROUTINE;');
        // 사유를 함께 저장해야 두 번째 노출 여부를 판단할 수 있다.
        expect(appSource).toContain('localStorage.setItem(getShareAfterSavePromptKey(uid), `${getKstDateString()}|${reason}`);');
        // 두 번째 유도는 같은 문구를 반복하지 않는다.
        expect(appSource).toContain('function applyShareAfterSaveCopy(');
        expect(appSource).toContain("markShareAfterSaveShown(user.uid, reason);");
        expect(appSource).toContain('applyShareAfterSaveCopy(reason);');
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
