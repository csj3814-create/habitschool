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
    it('places the detail column after on-chain HBT and before fasting glucose in both header and rows', () => {
        const source = readRepoFile('admin.html');
        const memberBodyIndex = source.indexOf('<tbody id="member-tbody">');
        const header = source.slice(source.lastIndexOf('<thead><tr>', memberBodyIndex), memberBodyIndex);
        const rowStart = source.indexOf('tbody.innerHTML = pageRows.map');
        const row = source.slice(rowStart, source.indexOf('</tr>`).join', rowStart));

        expect(header.indexOf('<th>온체인 HBT</th>')).toBeLessThan(header.indexOf('<th>상세</th>'));
        expect(header.indexOf('<th>상세</th>')).toBeLessThan(header.indexOf("sortBy('glucose')"));
        expect(row.indexOf('renderMemberOnchainHbtCell(r.uid)')).toBeLessThan(row.indexOf("openDetail('${r.uid}')"));
        expect(row.indexOf("openDetail('${r.uid}')")).toBeLessThan(row.indexOf('r.glucose'));
    });

    it('uses the shared email-aware member filter', () => {
        const source = readRepoFile('admin.html');

        expect(source).toContain('placeholder="🔍 이름 또는 이메일 검색..."');
        expect(source).toContain('filterAdminMemberRows(memberRows, term)');
    });

    it('renders persisted media as a wrapped gallery with one reusable keyboard-accessible viewer', () => {
        const source = readRepoFile('admin.html');
        const detailStart = source.indexOf('// ── Detail modal');
        const detailEnd = source.indexOf('window.sendReEngagement', detailStart);
        const detailSource = source.slice(detailStart, detailEnd);

        expect(source.match(/id="admin-media-lightbox"/g)).toHaveLength(1);
        expect(detailSource).toContain('collectAdminDailyLogMedia(log)');
        expect(detailSource).toContain('collectAdminDailyLogAnalyses(log)');
        expect(detailSource).toContain("if (!item || !isPersistedStorageUrl(item.url)) return;");
        expect(detailSource).toContain("e.key === 'Escape'");
        expect(detailSource).toContain("e.key === 'ArrowLeft'");
        expect(detailSource).toContain("e.key === 'ArrowRight'");
        expect(detailSource).toContain('admin-media-lightbox-thumbs');
        expect(detailSource).toContain('data-gallery-index');
        expect(detailSource).toContain('adminMediaTouchStartX');
        expect(detailSource).toContain('getAwardedPointsTotal(r.awardedPoints || {})');
        expect(detailSource).not.toContain('httpsCallable(');
        expect(source).toContain('.hc-media-list { display: grid;');
    });

    it('returns focus before hiding the gallery and sends comments through the admin callable', () => {
        const source = readRepoFile('admin.html');
        const closeStart = source.indexOf('window.closeAdminMediaLightbox');
        const closeEnd = source.indexOf('function stepAdminMediaLightbox', closeStart);
        const closeSource = source.slice(closeStart, closeEnd);
        const submitStart = source.indexOf('window.submitFb = async function()');
        const submitSource = source.slice(submitStart, source.indexOf('</script>', submitStart));

        expect(closeSource.indexOf('focusTarget.focus')).toBeLessThan(closeSource.indexOf("setAttribute('aria-hidden', 'true')"));
        expect(source).toContain("httpsCallable(fns, 'submitAdminFeedback')");
        expect(submitSource).toContain('submitAdminFeedbackCallable({ targetUid: uid, message: msg })');
        expect(submitSource).not.toContain("setDoc(doc(db,'users'");
        expect(submitSource).not.toContain("setDoc(doc(db,'daily_logs'");
    });

    it('loads the selected member records directly instead of relying on the global 500-row cache', () => {
        const source = readRepoFile('admin.html');

        expect(source).toContain("where('userId', '==', uid)");
        expect(source).toContain("where('date', '>=', cut)");
        expect(source).toContain("orderBy('date', 'desc')");
    });
});
