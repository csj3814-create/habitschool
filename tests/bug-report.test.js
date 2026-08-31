import { describe, expect, it } from 'vitest';
import { readAppSource, readRepoFile } from './source-helpers.js';

const MODULE = readRepoFile('js/bug-report.js');
const APP = readAppSource();
const HTML = readRepoFile('index.html');
const PWA = readRepoFile('js/pwa-install.js');
const FIRESTORE_RULES = readRepoFile('firestore.rules');
const STORAGE_RULES = readRepoFile('storage.rules');
const MANIFEST = JSON.parse(readRepoFile('manifest.json'));
const ADMIN = readRepoFile('admin.html');

// 제보가 "안 돼요" 한 줄로 오면 원인을 못 가린다. 사람이 못 적는 것은 자동으로 붙인다.
describe('bug report carries what a person cannot type', () => {
    it('buffers console errors and global failures', () => {
        expect(MODULE).toContain("['error', 'warn']");
        expect(MODULE).toContain("window.addEventListener('error'");
        expect(MODULE).toContain("window.addEventListener('unhandledrejection'");
    });

    it('keeps the original console behaviour intact', () => {
        expect(MODULE).toContain('return original.apply(console, args)');
    });

    it('bounds the buffer so a long session cannot grow without limit', () => {
        expect(MODULE).toMatch(/CONSOLE_BUFFER_LIMIT\s*=\s*\d+/);
        expect(MODULE).toContain('_consoleBuffer.shift()');
    });

    it('records whether the report came from the installed app or the web', () => {
        expect(MODULE).toContain('displayMode');
        expect(MODULE).toContain('isAndroidApp');
        expect(MODULE).toContain('assetVersion');
    });

    it('reads the asset version off the loaded script instead of hardcoding it', () => {
        // 숫자를 파일 안에 또 적어 두면 배포 때 한쪽만 올라가 제보에 틀린 버전이 실린다.
        expect(MODULE).toContain('export function readAssetVersion()');
        expect(MODULE).toContain('assetVersion: readAssetVersion()');
        expect(MODULE).not.toMatch(/ASSET_VERSION\s*=\s*'/);
    });

    it('shows that version under the report button', () => {
        expect(HTML).toContain('id="bug-report-version"');
        expect(APP).toContain('paintAssetVersionBadge');
    });

    it('still files the report when only the screenshot upload fails', () => {
        expect(MODULE).toContain('screenshotError');
        const at = MODULE.indexOf('if (screenshotFile)');
        const block = MODULE.slice(at, at + 400);
        expect(block).toContain('catch');
        // 첨부 실패가 throw 로 빠져나가면 본문까지 사라진다.
        expect(block).not.toContain('throw error');
    });

    it('tells the user when only the screenshot was dropped', () => {
        const at = APP.indexOf('window.sendBugReport');
        expect(at).toBeGreaterThan(-1);
        expect(APP.slice(at, at + 1200)).toContain('result.screenshotError');
    });

    it('installs the collectors at startup, not on first report', () => {
        expect(APP).toContain('installBugReportCollectors();');
    });

    it('exposes the modal from the profile tab', () => {
        expect(HTML).toContain('openBugReportModal()');
        expect(HTML).toContain('id="bug-report-modal"');
        expect(HTML).toContain('id="bug-report-message"');
        expect(HTML).toContain('id="bug-report-screenshot"');
    });
});

describe('bug report storage is private per reporter', () => {
    it('lets a member write only their own report', () => {
        const at = FIRESTORE_RULES.indexOf('match /bug_reports/{reportId}');
        expect(at).toBeGreaterThan(-1);
        const block = FIRESTORE_RULES.slice(at, at + 700);
        expect(block).toContain('request.resource.data.uid == request.auth.uid');
        expect(block).toContain('allow update, delete: if isAdmin()');
    });

    it('keeps another member from reading a report', () => {
        const at = FIRESTORE_RULES.indexOf('match /bug_reports/{reportId}');
        const block = FIRESTORE_RULES.slice(at, at + 700);
        expect(block).toMatch(/allow read: if isOwner\(resource\.data\.uid\) \|\| isAdmin\(\)/);
    });

    it('scopes screenshots to the reporter folder', () => {
        const at = STORAGE_RULES.indexOf('match /bug_reports/{userId}/{allFiles=**}');
        expect(at).toBeGreaterThan(-1);
        const block = STORAGE_RULES.slice(at, at + 500);
        expect(block).toContain('request.auth.uid == userId');
        expect(block).toContain('isImage()');
    });
});

// 웹 페이지는 설치된 앱을 직접 열 수 없다. 감지해서 안내만 한다.
describe('open-in-app banner', () => {
    it('declares the Play app so getInstalledRelatedApps can see it', () => {
        const play = (MANIFEST.related_applications || []).find((a) => a.platform === 'play');
        expect(play, 'manifest needs a play entry').toBeTruthy();
        expect(play.id).toBe('com.habitschool.app');
    });

    it('matches the play platform, not just the webapp one', () => {
        expect(PWA).toContain("=== 'play'");
        expect(PWA).toContain("'com.habitschool.app'");
    });

    it('stays hidden inside the app itself', () => {
        const at = PWA.indexOf('async function refreshOpenInAppBanner');
        const block = PWA.slice(at, at + 600);
        expect(block).toContain('isStandaloneInstallMode()');
    });

    it('uses window globals because this file is not a module', () => {
        expect(PWA).not.toMatch(/\nexport /);
        expect(PWA).toContain('window.dismissOpenInAppBanner = dismissOpenInAppBanner;');
    });
});

// 매일 볼 목록을 개발자 도구 뒤에 두면 아무도 안 본다.
describe('reports are readable without opening DevTools', () => {
    it('renders a section in the admin console, not just a console helper', () => {
        expect(ADMIN).toContain('id="bug-report-list"');
        expect(ADMIN).toContain('window.renderBugReports');
        expect(ADMIN).toContain('🐞 오류 제보');
    });

    it('lives in the moderation tab, next to the other things people file', () => {
        const at = ADMIN.indexOf('id="tab-moderation"');
        expect(at).toBeGreaterThan(-1);
        expect(ADMIN.slice(at, at + 1200)).toContain('id="bug-report-list"');
    });

    it('loads when that tab is opened', () => {
        expect(ADMIN).toMatch(/moderation'\)\s*\{[^}]*renderBugReports\(\)/);
    });

    it('escapes report text before putting it in the page', () => {
        // 제보 본문과 콘솔 출력은 사용자가 쓴 값이다. 그대로 innerHTML 에 넣으면 안 된다.
        expect(ADMIN).toContain('function bugEsc(');
        expect(ADMIN).toContain('bugEsc(v.message)');
        expect(ADMIN).toContain('bugEsc(dev.userAgent)');
    });

    it('offers the whole report for pasting into an analysis', () => {
        expect(ADMIN).toContain('window.copyBugReport');
    });
});

describe('report button reachable from any screen', () => {
    it('floats a report button over the record screens', () => {
        expect(HTML).toContain('id="bug-report-fab"');
        expect(HTML).toMatch(/id="bug-report-fab"[^>]*onclick="openBugReportModal\(\)"/);
    });
});
