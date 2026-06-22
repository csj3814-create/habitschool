import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const adminSource = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');

describe('admin economy transaction table controls', () => {
    it('provides name search and direct page movement for HBT transactions', () => {
        expect(adminSource).toContain('id="tx-name-search"');
        expect(adminSource).toContain('id="tx-page-input"');
        expect(adminSource).toContain('txGoToPage()');
        expect(adminSource).toContain('<th>회원</th><th>유형</th>');
        expect(adminSource).toContain("filterAdminRowsByName(txAllRows, searchTerm)");
    });

    it('provides name search and direct page movement for point awards', () => {
        expect(adminSource).toContain('id="all-points-name-search"');
        expect(adminSource).toContain('id="all-points-page-input"');
        expect(adminSource).toContain('allPointsGoToPage()');
        expect(adminSource).toContain("filterAdminRowsByName(allPointsRows, searchTerm)");
    });

    it('loads a bounded recent transaction set instead of cursor-only pages', () => {
        expect(adminSource).toContain("limit(500)");
        expect(adminSource).toContain('let txAllRows = [], txCurrentPage = 0;');
        expect(adminSource).not.toContain('txCursors');
        expect(adminSource).not.toContain('startAfter');
    });
});
