import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '..');
const readRepoFile = (path) => readFileSync(resolve(repoRoot, path), 'utf8');

describe('30-day report modal stylesheet', () => {
    it('keeps the mobile record-flow rules inside a balanced media query so the modal rule is parsed', () => {
        const css = readRepoFile('styles-reports.css');
        const reportModalIndex = css.indexOf('.report-modal {');
        const mobileMediaCloseIndex = css.indexOf('}');

        expect(css.trimStart()).toMatch(/^@media \(max-width: 480px\) \{/);
        expect(mobileMediaCloseIndex).toBeGreaterThan(0);
        expect(mobileMediaCloseIndex).toBeLessThan(reportModalIndex);
        expect(css.slice(reportModalIndex, reportModalIndex + 180)).toContain('position: fixed');
    });
});

describe('admin member detail UI', () => {
    it('uses the shared email-aware member filter', () => {
        const source = readRepoFile('admin.html');

        expect(source).toContain('placeholder="🔍 이름 또는 이메일 검색..."');
        expect(source).toContain('filterAdminMemberRows(memberRows, term)');
    });

    it('renders persisted media in one reusable enlarged viewer and shows stored analysis only', () => {
        const source = readRepoFile('admin.html');
        const detailStart = source.indexOf('// ── Detail modal');
        const detailEnd = source.indexOf('window.sendReEngagement', detailStart);
        const detailSource = source.slice(detailStart, detailEnd);

        expect(source.match(/id="admin-media-lightbox"/g)).toHaveLength(1);
        expect(detailSource).toContain('collectAdminDailyLogMedia(log)');
        expect(detailSource).toContain('collectAdminDailyLogAnalyses(log)');
        expect(detailSource).toContain("if (!isPersistedStorageUrl(url)) return;");
        expect(detailSource).toContain("e.key === 'Escape'");
        expect(detailSource).toContain('getAwardedPointsTotal(r.awardedPoints || {})');
        expect(detailSource).not.toContain('httpsCallable(');
    });

    it('loads the selected member records directly instead of relying on the global 500-row cache', () => {
        const source = readRepoFile('admin.html');

        expect(source).toContain("where('userId', '==', uid)");
        expect(source).toContain("where('date', '>=', cut)");
        expect(source).toContain("orderBy('date', 'desc')");
    });
});
