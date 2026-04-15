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
    it('does not call LauncherActivity metadata before the parent onCreate initializes it', () => {
        const launcherSource = readRepoFile('android/app/src/main/java/com/habitschool/app/HabitschoolLauncherActivity.kt');

        expect(launcherSource).not.toContain('val launchingUrl = super.getLaunchingUrl()');
        expect(launcherSource).toContain('val launchingUrl = intent?.data ?: Uri.parse("${AppRoutes.WEB_ORIGIN}/")');
    });

    it('uses a clean vector adaptive icon instead of the oversized bitmap foreground', () => {
        const launcherIcon = readRepoFile('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml');
        const launcherRoundIcon = readRepoFile('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml');
        const launcherForeground = readRepoFile('android/app/src/main/res/drawable/ic_launcher_foreground.xml');
        const colors = readRepoFile('android/app/src/main/res/values/colors.xml');

        expect(launcherIcon).toContain('@drawable/ic_launcher_foreground');
        expect(launcherRoundIcon).toContain('@drawable/ic_launcher_foreground');
        expect(launcherIcon).not.toContain('ic_launcher_foreground_inset');
        expect(launcherForeground).toContain('M41,63C45,69 63,69 67,63');
        expect(colors).toContain('<color name="launcher_background">#FFF4DE</color>');
    });
});
