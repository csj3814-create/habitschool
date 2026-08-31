import { describe, expect, it } from 'vitest';
import { readAppSource, readRepoFile } from './source-helpers.js';

const MODULE = readRepoFile('js/bug-report.js');
const APP = readAppSource();
const HTML = readRepoFile('index.html');
const PWA = readRepoFile('js/pwa-install.js');
const FIRESTORE_RULES = readRepoFile('firestore.rules');
const STORAGE_RULES = readRepoFile('storage.rules');
const MANIFEST = JSON.parse(readRepoFile('manifest.json'));

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
