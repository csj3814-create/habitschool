import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');
const APP = read('js/app-core.js');
const ADMIN = read('admin.html');
const RUNTIME = read('functions/runtime.js');
const RULES = read('firestore.rules');
const ROUTES = read('android/app/src/main/java/com/habitschool/app/AppRoutes.kt');

// 2026-09-16: Play 프로덕션 액세스가 두 번 반려됐고, 두 번 다 첫 사유가
// "비공개 테스트 중에 테스터가 앱에 참여하지 않았습니다" 였다.
//
// 그런데 몇 명이 앱을 실제로 여는지 볼 방법이 없었다. 안드로이드 셸은 항상
// ?native=... 를 붙여 열지만, 웹은 그 값을 URL 정리에만 쓰고 버렸다.
// 그래서 두 번 다 모르는 채로 신청하고 2주씩 잃었다.
describe('an app open leaves a trace we can count', () => {
    it('relies on the marker the Android shell actually sends', () => {
        // 이 값이 없어지면 측정이 통째로 조용히 멈춘다.
        expect(ROUTES).toContain('"native" to nativeSource');
        expect(ROUTES).toContain('nativeSource: String = "android-shell"');
        expect(APP).toContain("params.get('native')");
    });

    it('records the open on the user document', () => {
        const fn = APP.split('async function recordNativeAppOpen(user, settings) {')[1].split('\n}')[0];
        expect(fn).toContain('getRememberedNativeAppSource()');
        expect(fn).toContain('lastAppOpenDate: today');
        expect(fn).toContain('lastAppOpenSource: source');
        expect(APP).toContain('recordNativeAppOpen(user, ud.settings)');
    });

    it('writes nothing for a web visit', () => {
        const fn = APP.split('async function recordNativeAppOpen(user, settings) {')[1].split('\n}')[0];
        expect(fn).toContain('if (!user || !source) return;');
    });

    it('writes once a day, not once an open', () => {
        const fn = APP.split('async function recordNativeAppOpen(user, settings) {')[1].split('\n}')[0];
        // 하루 한 번. 다만 같은 날 앱을 업데이트해 버전이 바뀌면 그것은 다시 남긴다.
        expect(fn).toContain('const sameDay = settings && settings.lastAppOpenDate === today;');
        expect(fn).toContain('if (sameDay && sameVersion) return;');
    });

    it('keeps the field inside settings, which the rules already allow', () => {
        // 새 최상위 필드는 firestore.rules 를 함께 배포해야 하고, 빠뜨리면 쓰기가
        // permission-denied 로 조용히 거부된다(2026-08-15 consents).
        const whitelist = RULES.split('function isAllowedUserField()')[1].split('}')[0];
        expect(whitelist).toContain("'settings'");
        expect(whitelist).not.toContain('lastAppOpenDate');
        const fn = APP.split('async function recordNativeAppOpen(user, settings) {')[1].split('\n}')[0];
        const block = fn.split('settings: {')[1].split('},')[0];
        expect(block).toContain('lastAppOpenDate: today');
        expect(block).toContain('appOpenDates:');
        expect(fn).toContain('{ merge: true }');
    });

    it('collects the days, not only the latest one', () => {
        // 2026-09-22: 마지막 날짜 하나로는 "14일 중 며칠 열었다" 를 셀 수 없다.
        // Play 재신청은 그 숫자를 보는데 우리에게는 없었다.
        const fn = APP.split('async function recordNativeAppOpen(user, settings) {')[1].split('\n}')[0];
        expect(fn).toContain('appOpenDates: arrayUnion(today)');
        // 읽고 쓰면 짧게 답한 읽기가 지난 날짜를 지운다(lessons 264).
        expect(fn).not.toContain('getDoc(');
    });

    it('logs a failed write instead of swallowing it', () => {
        // 삼키면 다음 심사 때도 모르는 채로 신청하게 된다.
        const fn = APP.split('async function recordNativeAppOpen(user, settings) {')[1].split('\n}')[0];
        expect(fn).toContain('console.warn(');
    });
});

describe('the admin sees how the Play app is used after launch', () => {
    // 비공개 테스트 때는 12명 요건을 보던 화면이다. 2026-10-07 스토어 공개 뒤로는
    // 사용량(7/30일), 공개 뒤 새로 들어온 회원, 웹 → 앱 전환을 본다.
    const fn = RUNTIME.split('exports.getAdminAppUsage = onCall(')[1].split('\n);')[0];

    it('is admin-only and reads only settings', () => {
        expect(fn).toContain('await assertAdminRequest(request)');
        expect(fn).toContain('.where("settings.lastAppOpenDate", ">=", since)');
        expect(fn).toContain('.where("settings.lastWebOpenDate", ">=", since)');
    });

    it('looks back thirty days and counts the store launch from its date', () => {
        expect(RUNTIME).toContain('const APP_USAGE_DEFAULT_WINDOW_DAYS = 30;');
        expect(RUNTIME).toContain('const PLAY_PUBLIC_RELEASE_DATE = "2026-10-07";');
        expect(fn).toContain('newSinceRelease:');
        expect(fn).toContain('active7:');
    });

    it('counts Android web members who have not opened the app — the invite\'s audience', () => {
        expect(fn).toContain('if (appUids.has(docSnap.id)) return;');
        expect(fn).toContain('settings.lastWebPlatform === "android"');
        expect(fn).toContain('settings.lastAppInviteTapDate');
    });

    it('no longer talks about the closed-test bar', () => {
        expect(RUNTIME).not.toContain('PLAY_CLOSED_TEST_MIN_TESTERS');
        const panel = ADMIN.split('window.loadAppUsage = async function loadAppUsage() {')[1].split('\n    };')[0];
        expect(panel).not.toContain('옵트인');
        expect(ADMIN).not.toContain('Play 요건');
        expect(ADMIN).toContain('안드로이드 Play 앱 사용');
    });

    it('names 1.0.10 instead of showing v13', () => {
        expect(ADMIN).toContain("'13': '1.0.10'");
    });

    it('needs no composite index for that query', () => {
        // 중첩 필드는 단일 필드 색인이 자동으로 붙는다. 색인 배포가 없어야 한다.
        expect(read('firestore.indexes.json')).not.toContain('lastAppOpenDate');
    });

    it('warns that the history starts at deploy, not before', () => {
        // 배포 전 기록은 없다. 0명을 보고 "아무도 안 쓴다" 고 읽으면 안 된다.
        const fn = ADMIN.split('window.loadAppUsage = async function loadAppUsage() {')[1].split('\n    };')[0];
        expect(fn).toContain('이 기능을 배포한 날 이후부터 쌓입니다');
    });

    it('is loaded with the system tab', () => {
        expect(ADMIN).toContain('id="appusage-count"');
        expect(ADMIN).toContain('loadBloodTestQuality(), loadAppUsage()');
    });

    it('reports a failure instead of showing a silent zero', () => {
        const fn = ADMIN.split('window.loadAppUsage = async function loadAppUsage() {')[1].split('\n    };')[0];
        expect(fn).toContain('console.error(');
        expect(fn).toContain('불러오지 못했습니다');
    });
});

describe('앱을 연 기록에 앱 버전이 남는다', () => {
    // 2026-09-24: 비공개 테스트 앱은 Play 검색에 안 나온다. 테스터가 1.0.6 을
    // 받았는지 우리 쪽에서 알 방법이 없었다. 1.0.6 부터 셸이 nativeVersion 을
    // 붙여 여므로, 앱을 연 기록에 그 값을 남긴다. 비어 있으면 그 전 버전이다.
    const fn = APP.split('async function recordNativeAppOpen(user, settings) {')[1].split('\n}\n')[0];

    it('버전을 남긴다', () => {
        expect(fn).toContain('const appVersion = getRememberedNativeAppVersion();');
        expect(fn).toContain('lastAppVersion: appVersion');
    });

    it('같은 날이라도 버전이 바뀌면 다시 남긴다', () => {
        expect(fn).toContain('if (sameDay && sameVersion) return;');
    });
});

describe('관리자 화면에서 누가 새 버전을 받았는지 본다', () => {
    it('서버가 회원마다 앱 버전을 돌려준다', () => {
        const fn = RUNTIME.split('exports.getAdminAppUsage = onCall(')[1].split('\n);')[0];
        expect(fn).toContain('appVersion: String(settings.lastAppVersion || "")');
    });

    it('화면이 버전과 최신 버전 사용 인원을 보인다', () => {
        const fn = ADMIN.split('window.loadAppUsage = async function loadAppUsage() {')[1].split('\n    };')[0];
        expect(fn).toContain("'이전 버전'");
        expect(fn).toContain("set('appusage-updated',");
        expect(ADMIN).toContain('id="appusage-updated"');
    });
});
