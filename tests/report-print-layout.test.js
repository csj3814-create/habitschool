import { describe, expect, it } from 'vitest';
import { readAppSource, readRepoFile } from './source-helpers.js';

describe('30-day report A4 two-up print layout', () => {
    it('routes printing through a dedicated one-sheet preparation step', () => {
        const html = readRepoFile('index.html');
        const appSource = readAppSource();

        expect(html).toContain('onclick="print30DayReport()"');
        expect(html).not.toContain('onclick="window.print()"');
        expect(appSource).toContain("const REPORT_PRINT_TOP_SECTIONS = Object.freeze(['summary', 'category', 'points']);");
        expect(appSource).toContain("const REPORT_PRINT_BOTTOM_SECTIONS = Object.freeze(['category-trend', 'health', 'heatmap']);");
        expect(appSource).toContain('window.print30DayReport = async function ()');
        expect(appSource).toContain("window.addEventListener('afterprint', remove30DayReportPrintSheet, { once: true });");
    });

    it('marks the existing report sections without adding new calculations', () => {
        const appSource = readAppSource();

        for (const section of ['summary', 'category', 'points', 'category-trend', 'health', 'heatmap']) {
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
        expect(css).toContain('height: 150px;\n    object-fit: fill;');
        expect(css).toContain('.report-print-sheet .hm-cell {\n    height: 26px;\n    aspect-ratio: auto;');
        expect(css).toContain('page-break-inside: avoid;');
    });
});
