import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(TEST_DIR, '..');

function readRepoFile(relativePath) {
    return readFileSync(resolve(ROOT_DIR, relativePath), 'utf8');
}

describe('android launcher bootstrap and icon resources', () => {
    it('opens the primary launcher entry in a real browser and keeps TWA for trusted special-entry flows', () => {
        const launcherSource = readRepoFile('android/app/src/main/java/com/habitschool/app/HabitschoolLauncherActivity.kt');
        const launcherLayout = readRepoFile('android/app/src/main/res/layout/activity_launcher_loading.xml');
        const manifest = readRepoFile('android/app/src/main/AndroidManifest.xml');

        expect(launcherSource).not.toContain('val launchingUrl = super.getLaunchingUrl()');
        expect(launcherSource).toContain('val launchingUrl = intent?.data ?: Uri.parse("${AppRoutes.WEB_ORIGIN}/")');
        expect(launcherSource).toContain('private fun isPrimaryLauncherEntry(): Boolean {');
        expect(launcherSource).toContain('if (isPrimaryLauncherEntry()) {');
        expect(launcherSource).toContain('openBrowserSurface(targetUrl, "main-launcher-browser")');
        expect(launcherSource).toContain('if (shouldLaunchTrustedSurface(targetUrl)) {');
        expect(launcherSource).toContain('private fun shouldLaunchTrustedSurface(targetUrl: Uri): Boolean {');
        expect(launcherSource).toContain('scheduleLaunchTimeout()');
        expect(launcherSource).toContain('CustomTabsClient.bindCustomTabsService(');
        expect(launcherSource).toContain('client.warmup(0L)');
        expect(launcherSource).toContain('client.newSession(null)?.mayLaunchUrl(targetUrl, null, null)');
        expect(launcherSource).toContain('twaLauncher = TwaLauncher(this, preferredPackage)');
        expect(launcherSource).toContain('private fun resolveExternalBrowserPackage(targetUrl: Uri): String? {');
        expect(launcherSource).toContain('filter { it.isNotBlank() && it != packageName }');
        expect(launcherSource).toContain('PREFERRED_BROWSER_PACKAGES.firstOrNull(candidatePackages::contains)');
        expect(launcherLayout).toContain('앱을 여는 중입니다. 잠시만 기다려 주세요.');
        expect(manifest).toContain('android:theme="@style/Theme.Habitschool"');
    });

    it('keeps the original bitmap-based launcher icon wiring', () => {
        const launcherIcon = readRepoFile('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml');
        const launcherRoundIcon = readRepoFile('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml');
        const launcherInset = readRepoFile('android/app/src/main/res/drawable/ic_launcher_foreground_inset.xml');
        const colors = readRepoFile('android/app/src/main/res/values/colors.xml');

        expect(launcherIcon).toContain('@drawable/ic_launcher_foreground_inset');
        expect(launcherRoundIcon).toContain('@drawable/ic_launcher_foreground_inset');
        expect(launcherInset).toContain('@mipmap/ic_launcher_foreground_actual');
        expect(colors).toContain('<color name="launcher_background">#FF9800</color>');
    });

    it('declares the WebView fallback activity needed when no TWA browser is available', () => {
        const manifest = readRepoFile('android/app/src/main/AndroidManifest.xml');

        expect(manifest).toContain('android:name="com.google.androidbrowserhelper.trusted.WebViewFallbackActivity"');
        expect(manifest).toContain('android:exported="false"');
    });
});
