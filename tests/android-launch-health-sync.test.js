import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(TEST_DIR, '..');

function readRepoFile(relativePath) {
    return readFileSync(resolve(ROOT_DIR, relativePath), 'utf8');
}

const LAUNCHER = 'android/app/src/main/java/com/habitschool/app/HabitschoolLauncherActivity.kt';
const MANIFEST = 'android/app/src/main/AndroidManifest.xml';

// 2026-09-10: 앱을 열 때마다 오늘 걸음수를 직접 읽는다. 예전에는 캐시(15분 창)만
// 봤기 때문에 동기화 버튼을 누른 직후가 아니면 거의 항상 비어 있었다.
describe('Android launch-time Health Connect sync', () => {
    it('reads Health Connect on launch instead of only reusing the cached snapshot', () => {
        const source = readRepoFile(LAUNCHER);

        expect(source).toContain('private suspend fun refreshHealthConnectLaunchUrl(launchingUrl: Uri)');
        expect(source).toContain('healthConnectManager.syncTodaySteps()');
        expect(source).toContain('refreshHealthConnectLaunchUrl(launchingUrl)');
        expect(source).toContain('launchResolvedSurface()');
    });

    // 이 자리는 흰 화면·타임아웃으로 여러 번 고친 곳이다. 새로 넣은 읽기가
    // 실행을 막을 수 있는 유일한 경로가 되면 안 된다.
    it('never lets the launch hang on the Health Connect read', () => {
        const source = readRepoFile(LAUNCHER);

        expect(source).toContain('private const val AUTO_HEALTH_SYNC_TIMEOUT_MS');
        expect(source).toContain('withTimeoutOrNull(AUTO_HEALTH_SYNC_TIMEOUT_MS)');
        // 읽기 전에 캐시 폴백이 먼저 서 있어야 한다.
        const beforePost = source.split('window.decorView.post')[0];
        expect(beforePost).toContain('launchUrlOverride = resolveFreshHealthConnectLaunchUrl(launchingUrl)');
        // 예외는 삼키되 조용히 삼키지 않는다 (CLAUDE.md 2026-08-15).
        expect(source).toContain('runCatching { healthConnectManager.syncTodaySteps() }');
        expect(source).toContain('Log.w(TAG, "Launch health sync did not finish in time, keeping cached snapshot")');
    });

    it('asks for no new Android permission — the launch read is a foreground read', () => {
        const manifest = readRepoFile(MANIFEST);
        // 앱이 "요청하는" 권한만 센다. activity-alias 의 android:permission 은
        // 호출하는 쪽에 요구하는 권한이라 성격이 다르다 (START_ONBOARDING).
        const healthPermissions = [...manifest.matchAll(
            /<uses-permission\s+android:name="(android\.permission\.health\.[A-Z_]+)"/g
        )].map(([, name]) => name);

        // Play 프로덕션 액세스 재신청(9/12) 전에는 건강 권한을 늘리지 않는다.
        // 늘리면 데이터 보안 선언과 건강 권한 선언을 새로 써야 한다.
        expect(healthPermissions).toEqual(['android.permission.health.READ_STEPS']);
        expect(manifest).not.toContain('READ_HEALTH_DATA_IN_BACKGROUND');
    });

    it('skips the launch read when the URL already carries a synced value or a share payload', () => {
        const source = readRepoFile(LAUNCHER);

        expect(source).toContain('private fun isAutoHealthSyncEligible(launchingUrl: Uri): Boolean');
        expect(source).toContain('if (launchingUrl.getQueryParameter("focus") == "health-connect-steps") return false');
        expect(source).toContain('if (launchingUrl.getQueryParameter("focus") == "shared-upload") return false');
        expect(source).toContain('if (launchingUrl.encodedPath == "/share-target") return false');
        // 캐시 폴백과 자동 읽기가 같은 판정을 쓴다.
        expect(source).toContain('if (!isAutoHealthSyncEligible(launchingUrl)) {');
    });
});

// 2026-09-10: 런처는 TWA 를 띄운 뒤 스스로 끝나므로, 최근 앱에서 복귀하면 런처가
// 아예 돌지 않는다. 그래서 첫 실행에 박힌 걸음수가 그대로 남아 있었다. 웹이 복귀를
// 감지해 네이티브 동기화를 한 번 더 태우는 것으로 메운다 — APK 변경 없이.
describe('web-side step refresh when the user comes back to the app', () => {
    const APP_CORE = 'js/app-core.js';

    it('re-syncs on return instead of leaving the first launch value pinned', () => {
        const source = readRepoFile(APP_CORE);

        expect(source).toContain('function shouldRefreshNativeStepsOnReturn(');
        expect(source).toContain('function maybeRefreshNativeStepsOnReturn(');
        expect(source).toContain("startNativeHealthConnectSync({ source: 'android-resume-sync' })");
        expect(source).toContain("document.visibilityState !== 'visible'");
    });

    it('only fires where a reload is worth its cost', () => {
        const source = readRepoFile(APP_CORE);
        const guard = source
            .split('function shouldRefreshNativeStepsOnReturn(')[1]
            .split('\n}\n')[0];

        // 웹/PWA 에는 딥링크가 닿을 네이티브가 없다.
        expect(guard).toContain('if (!getRememberedNativeAppSource()) return false;');
        // 걸음수를 보고 있을 때만. 다른 탭에서 깜빡일 이유가 없다.
        expect(guard).toContain("if (getVisibleTabName() !== 'exercise') return false;");
        // 권한을 받은 적이 없으면 네이티브가 권한 창을 띄운다 — 요청한 적 없는 개입이다.
        expect(guard).toContain('HEALTH_CONNECT_SOURCE');
        // 오늘 기록에만.
        expect(guard).toContain('getKstDateString()');
        // 낡았을 때만, 그리고 너무 자주는 아니게.
        expect(guard).toContain('NATIVE_STEP_REFRESH_STALE_MS');
        expect(guard).toContain('NATIVE_STEP_REFRESH_COOLDOWN_MS');
    });

    it('marks the attempt before navigating away so a failing sync cannot bounce every open', () => {
        const source = readRepoFile(APP_CORE);
        const body = source
            .split('function maybeRefreshNativeStepsOnReturn(')[1]
            .split('\n}\n')[0];

        const markAt = body.indexOf('markNativeStepRefreshAttempt()');
        const navigateAt = body.indexOf('startNativeHealthConnectSync(');
        expect(markAt).toBeGreaterThan(-1);
        expect(navigateAt).toBeGreaterThan(markAt);
    });

    it('keeps the manual button working with no argument', () => {
        const source = readRepoFile(APP_CORE);
        const indexSource = readRepoFile('index.html');

        expect(source).toContain("function startNativeHealthConnectSync({ source = 'android-web-sync' } = {}) {");
        expect(indexSource).toContain('onclick="startNativeHealthConnectSync()"');
    });
});
