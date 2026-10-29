// 2026-10-21 운영·스테이징 콘솔: "Uncaught (in promise) NotAllowedError: Failed to execute 'writeText' on 'Clipboard'".
// 초대 링크 공유(shareReferralLink)·앱 공유(shareApp)가 복사 실패를 받지 않아, 복사 권한이 없는 브라우저(앱 안 브라우저 등)에서는
// 단추를 눌러도 아무 안내 없이 끝났다. 실패하면 다른 복사 방식으로 다시 시도하는 copyTextToClipboard 를 쓴다.

import { describe, expect, it } from 'vitest';
import { readRawRepoFile } from './source-helpers.js';

const APP = readRawRepoFile('js/app-core.js');

function body(signature) {
    const start = APP.indexOf(signature);
    expect(start, signature).toBeGreaterThan(-1);
    return APP.slice(start, APP.indexOf('\n};\n', start) > -1 && APP.indexOf('\n}\n', start) > APP.indexOf('\n};\n', start)
        ? APP.indexOf('\n};\n', start)
        : APP.indexOf('\n}\n', start));
}

describe('공유 단추의 복사 실패를 받는다', () => {
    it('초대 링크 공유는 받는 곳 없는 clipboard.writeText 를 쓰지 않는다', () => {
        const fn = body('window.shareReferralLink = function(platform) {');
        expect(fn).not.toMatch(/clipboard\.writeText\([^)]*\)\s*\.then\([^;]*\);/);
        expect(fn.match(/copyTextToClipboard\(url, /g)).toHaveLength(3);
    });

    it('copyTextToClipboard 는 실패하면 다른 방식으로 다시 복사한다', () => {
        const fn = body('async function copyTextToClipboard(');
        expect(fn).toMatch(/catch \(_\) \{\s*fallbackCopyToClipboard\(text, successMessage, showMessage\);/);
    });
});
