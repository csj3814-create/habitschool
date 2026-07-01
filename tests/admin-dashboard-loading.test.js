import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const adminSource = readFileSync(path.resolve(__dirname, '../admin.html'), 'utf8');

describe('admin dashboard progressive loading', () => {
    it('bounds dashboard Firestore reads so one slow source cannot hold the full view blank', () => {
        expect(adminSource).toContain('ADMIN_DASHBOARD_CORE_TIMEOUT_MS');
        expect(adminSource).toContain('ADMIN_DASHBOARD_OPTIONAL_TIMEOUT_MS');
        expect(adminSource).toContain('resolveAdminRead(dailyLogsPromise');
        expect(adminSource).toContain('resolveAdminRead(usersPromise');
        expect(adminSource).toContain('getData(false, { allowPartial: true })');
        expect(adminSource).toContain('if (!result.partial) cache = { snap, usersQ };');
    });

    it('renders explicit delayed states instead of false zeroes when admin data is late', () => {
        expect(adminSource).toContain(".forEach((id) => setAdminText(id, '확인 중'))");
        expect(adminSource).toContain("data.usersFallback ? '확인 중' : usersQ.size");
        expect(adminSource).toContain("weekDelayed ? '확인 중' : todaySet.size");
        expect(adminSource).toContain('회원 조회가 지연되고 있습니다. 새로고침으로 다시 확인해 주세요.');
        expect(adminSource).toContain("doneRead.fallback ? '확인 중'");
    });

    it('makes manual admin refresh clear shared dashboard data, not only member rows', () => {
        expect(adminSource).toContain('window.refreshTab = function()');
        expect(adminSource).toContain('adminTokenStatsCache = null;');
        expect(adminSource).toContain('cache = null;');
        expect(adminSource).not.toContain("if (name === 'members') cache = null;");
    });
});
