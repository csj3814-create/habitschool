import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(TEST_DIR, '..');

function readRepoFile(relativePath) {
    return readFileSync(resolve(ROOT_DIR, relativePath), 'utf8');
}

describe('android widget and manual health connect wiring', () => {
    it('keeps the widget compact at 2x2 and removes the wide dual-button layout', () => {
        const widgetInfo = readRepoFile('android/app/src/main/res/xml/habitschool_widget_info.xml');
        const widgetLayout = readRepoFile('android/app/src/main/res/layout/widget_habitschool_summary.xml');

        expect(widgetInfo).toContain('android:minWidth="110dp"');
        expect(widgetInfo).toContain('android:minHeight="110dp"');
        expect(widgetInfo).toContain('android:targetCellWidth="2"');
        expect(widgetInfo).toContain('android:targetCellHeight="2"');
        expect(widgetLayout).toContain('android:id="@+id/widget_sync_button"');
        expect(widgetLayout).not.toContain('widget_open_button');
    });

    it('preserves the current web return URL for manual health connect sync', () => {
        const appSource = readRepoFile('js/app.js');
        const nativeEntrySource = readRepoFile('android/app/src/main/java/com/habitschool/app/NativeEntryActivity.kt');

        expect(appSource).toContain("function buildManualHealthConnectReturnUrl()");
        expect(appSource).toContain("syncUrl.searchParams.set('returnTo', buildManualHealthConnectReturnUrl());");
        expect(nativeEntrySource).toContain('getQueryParameter("returnTo")');
        expect(nativeEntrySource).toContain('openAfterSync = returnToUri ?: AppRoutes.exerciseUri(source)');
    });
});
