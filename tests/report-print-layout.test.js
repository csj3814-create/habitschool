import { describe, expect, it } from 'vitest';
import { readAppSource, readRepoFile } from './source-helpers.js';

describe('30-day report A4 two-up print layout', () => {
    it('routes printing through a dedicated one-sheet preparation step', () => {
        const html = readRepoFile('index.html');
        const appSource = readAppSource();

        expect(html).toContain('onclick="print30DayReport()"');
        expect(html).not.toContain('onclick="window.print()"');
        // 2026-09-21: 활동·수면과 AI 요약이 늘었다. 화면에만 있고 인쇄에 자리가
        // 없으면 출력물에서 통째로 사라진다 — 목록에 같이 넣어야 한다.
        expect(appSource).toContain("const REPORT_PRINT_TOP_SECTIONS = Object.freeze(['summary', 'category', 'activity', 'points']);");
        expect(appSource).toContain("const REPORT_PRINT_BOTTOM_SECTIONS = Object.freeze(['category-trend', 'ai', 'health', 'calendar']);");

        // 그리는 구역과 인쇄하는 구역이 갈라지면 조용히 빠진다. 전부 한쪽에는 있어야 한다.
        const rendered = [...appSource.matchAll(/data-report-section="([a-z-]+)"/g)].map((m) => m[1]);
        const printed = [
            ...appSource.split('REPORT_PRINT_TOP_SECTIONS = Object.freeze([')[1].split(']')[0].matchAll(/'([a-z-]+)'/g),
            ...appSource.split('REPORT_PRINT_BOTTOM_SECTIONS = Object.freeze([')[1].split(']')[0].matchAll(/'([a-z-]+)'/g),
        ].map((m) => m[1]);
        for (const section of new Set(rendered)) {
            expect(printed, `${section} 구역이 인쇄 목록에 없다`).toContain(section);
        }
        expect(appSource).toContain('window.print30DayReport = async function ()');
        expect(appSource).not.toContain("window.addEventListener('afterprint', remove30DayReportPrintSheet");
        expect(appSource).toContain('Keep the hidden print sheet alive until');
    });

    it('keeps the native print snapshot alive and cleans it only when the report closes', () => {
        const html = readRepoFile('index.html');
        const appSource = readAppSource();

        expect(html).toContain('onclick="close30DayReport()"');
        expect(html).not.toContain("document.getElementById('report-modal').style.display='none'");
        expect(appSource).toContain('window.close30DayReport = function ()');
        expect(appSource).toMatch(/window\.close30DayReport = function \(\) \{[\s\S]*?remove30DayReportPrintSheet\(\);[\s\S]*?modal\.style\.display = 'none';[\s\S]*?\};/);
    });

    it('marks the existing report sections without adding new calculations', () => {
        const appSource = readAppSource();

        for (const section of ['summary', 'category', 'points', 'category-trend', 'health', 'calendar']) {
            expect(appSource).toContain(`data-report-section="${section}"`);
        }
        expect(appSource).toContain("image.src = canvas.toDataURL('image/png');");
        expect(appSource).toContain("sourceNode.querySelectorAll('canvas')");
        expect(appSource).toContain("clone.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));");
    });

    it('fits two half-page panels inside one A4 portrait sheet and isolates the screen flex layout', () => {
        const css = readRepoFile('styles-reports.css');

        expect(css).toContain('@page {\n    size: A4 portrait;\n    margin: 0;');
        expect(css).toContain('width: 210mm;\n    height: 296mm;');
        expect(css).toContain('grid-template-rows: 148mm 148mm;');
        expect(css).toContain('body.report-printing > *:not(#report-print-sheet)');
        expect(css).toContain('body.report-printing #report-print-sheet');
        expect(css).toContain('display: block !important;');
        expect(css).toContain('.report-actions {\n        display: none !important;');
        expect(css).toContain('height: 150px;\n    object-fit: fill;');
        // 인쇄에서는 달력 칸이 정사각형일 필요가 없다. 높이를 고정하고 비율을 푼다.
        const printCell = css.split('.report-print-sheet .rc-cell {')[1].split('}')[0];
        expect(printCell).toContain('height: 26px;');
        expect(printCell).toContain('aspect-ratio: auto;');
        // 화면용 최소 높이가 남아 있으면 26px 지정이 먹지 않는다.
        expect(printCell).toContain('min-height: 0;');
        expect(css).toContain('page-break-inside: avoid;');
    });
});
