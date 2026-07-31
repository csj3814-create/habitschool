import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(TEST_DIR, '..');

function readRepoFile(relativePath) {
    return readFileSync(resolve(ROOT_DIR, relativePath), 'utf8');
}

function readRepoBuffer(relativePath) {
    return readFileSync(resolve(ROOT_DIR, relativePath));
}

describe('android launcher bootstrap and icon resources', () => {
    it('uses TWA for the primary launcher entry while falling back to in-app WebView instead of blocking launcher startup', () => {
        const launcherSource = readRepoFile('android/app/src/main/java/com/habitschool/app/HabitschoolLauncherActivity.kt');
        const launcherLayout = readRepoFile('android/app/src/main/res/layout/activity_launcher_loading.xml');
        const manifest = readRepoFile('android/app/src/main/AndroidManifest.xml');

        expect(launcherSource).not.toContain('val launchingUrl = super.getLaunchingUrl()');
        expect(launcherSource).toContain('val launchingUrl = intent?.data ?: Uri.parse("${AppRoutes.WEB_ORIGIN}/")');
        expect(launcherSource).toContain('private val launcherMetadata by lazy { LauncherActivityMetadata.parse(this) }');
        expect(launcherSource).toContain('if (isPrimaryLauncherEntry()) {');
        expect(launcherSource).toContain('openWebViewFallback(requireLaunchingUrl(), "launcher-timeout-webview")');
        expect(launcherSource).toContain('private fun openWebViewFallback(targetUrl: Uri, reason: String) {');
        expect(launcherSource).toContain('WebViewFallbackActivity.createLaunchIntent(this, targetUrl, launcherMetadata)');
        expect(launcherSource).toContain('TrustedWebActivityIntentBuilder(targetUrl)');
        expect(launcherSource).toContain('TwaLauncher.WEBVIEW_FALLBACK_STRATEGY');
        expect(launcherSource).toContain('showLauncherTimeoutFallbackUi()');
        expect(launcherSource).toContain('private fun resolveExternalBrowserPackage(targetUrl: Uri): String? {');
        expect(launcherSource).toContain('filter { it.isNotBlank() && it != packageName }');
        expect(launcherSource).toContain('PREFERRED_BROWSER_PACKAGES.firstOrNull(candidatePackages::contains)');
        expect(launcherSource).not.toContain('CustomTabsClient.bindCustomTabsService(');
        expect(launcherSource).not.toContain('runBlocking');
        expect(launcherSource).not.toContain('shouldAutoSyncHealthConnect(');
        expect(launcherSource).not.toContain('main-launcher-browser');
        expect(launcherLayout).toContain('launcher_timeout_hint');
        expect(launcherLayout).toContain('launcher_open_browser_button');
        expect(manifest).toContain('android:theme="@style/Theme.Habitschool"');
    });

    it('scales the launcher foreground instead of drawing it at native size', () => {
        const launcherIcon = readRepoFile('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml');
        const launcherRoundIcon = readRepoFile('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml');
        const foreground = readRepoFile('android/app/src/main/res/drawable/ic_launcher_foreground.xml');
        const background = readRepoFile('android/app/src/main/res/drawable/ic_launcher_background.xml');

        for (const icon of [launcherIcon, launcherRoundIcon]) {
            expect(icon).toContain('@drawable/ic_launcher_background');
            expect(icon).toContain('@drawable/ic_launcher_foreground');
            expect(icon).toContain('@drawable/ic_launcher_monochrome');
        }
        expect(foreground).toContain('@mipmap/ic_launcher_foreground_actual');
        // gravity="center"는 비트맵을 축소하지 않아 108dp 캔버스를 넘치고, 마스크가
        // 가장자리를 잘라 얼굴만 확대돼 보였다. 반드시 fill이어야 한다.
        expect(foreground).toContain('android:gravity="fill"');
        expect(foreground).not.toContain('android:gravity="center"');
        expect(background).toContain('android:type="radial"');
    });

    // 108dp 캔버스 = 432px(4x). 마스크가 가장자리 18dp(72px)를 잘라낼 수 있으므로
    // 그 띠 안에는 그림이 한 픽셀도 없어야 한다. 이 조건이 깨지면 예전처럼
    // 얼굴만 확대돼 보이는 증상이 다시 나온다.
    it.each([
        'android/app/src/main/res/mipmap-nodpi/ic_launcher_foreground_actual.png',
        'android/app/src/main/res/mipmap-nodpi/ic_launcher_monochrome.png'
    ])('keeps %s inside the adaptive icon safe zone', async (relativePath) => {
        const { data, info } = await sharp(readRepoBuffer(relativePath))
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        expect(info.width).toBe(432);
        expect(info.height).toBe(432);

        const margin = (info.width * 18) / 108;
        let paintedOutsideSafeZone = 0;
        for (let y = 0; y < info.height; y += 1) {
            for (let x = 0; x < info.width; x += 1) {
                const inSafeZone = x >= margin && x < info.width - margin
                    && y >= margin && y < info.height - margin;
                if (inSafeZone) continue;
                if (data[(y * info.width + x) * info.channels + 3] > 8) paintedOutsideSafeZone += 1;
            }
        }

        expect(paintedOutsideSafeZone).toBe(0);
    });

    it('ships a transparent silhouette for the web push notification badge', async () => {
        // 안드로이드는 badge의 알파만 읽어 실루엣으로 그린다. 불투명 이미지를 주면
        // 알림 줄에 흰 사각형만 보인다(불투명 아이콘을 쓰던 시절의 증상).
        const serviceWorker = readRepoFile('sw.js');
        expect(serviceWorker).toContain("badge: './icons/notification-badge.png'");

        const { data, info } = await sharp(readRepoBuffer('icons/notification-badge.png'))
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        let transparent = 0;
        for (let i = 3; i < data.length; i += info.channels) {
            if (data[i] < 8) transparent += 1;
        }

        expect(transparent).toBeGreaterThan(info.width * info.height * 0.3);
    });

    it('declares the WebView fallback activity needed when no TWA browser is available', () => {
        const manifest = readRepoFile('android/app/src/main/AndroidManifest.xml');

        expect(manifest).toContain('android:name="com.google.androidbrowserhelper.trusted.WebViewFallbackActivity"');
        expect(manifest).toContain('android:exported="false"');
    });
});
