import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const adminSource = readFileSync(path.resolve(__dirname, '../admin.html'), 'utf8');
const functionsSource = readFileSync(path.resolve(__dirname, '../functions/runtime.js'), 'utf8');

function loadCreateAdminSnapshot() {
    const match = adminSource.match(/function createAdminSnapshot[\s\S]*?(?=\n\s*let adminDashboardSourcesInFlight)/);
    if (!match) throw new Error('createAdminSnapshot source not found');
    return new Function(`${match[0]}; return createAdminSnapshot;`)();
}

describe('admin dashboard progressive loading', () => {
    it('loads the dashboard through one admin callable instead of browser-wide Firestore scans', () => {
        expect(adminSource).toContain("httpsCallable(fns, 'getAdminDashboardSnapshot')");
        expect(adminSource).toContain('async function loadAdminDashboardSources()');
        expect(adminSource).toContain('adminDashboardSourcesInFlight');
        expect(adminSource).toContain('loadAdminDashboardSourcesOnce()');
        expect(adminSource).toContain('getAdminDashboardSnapshotCallable({ todayStr })');
        expect(adminSource).toContain('const [dashboardSources, tokenStatsRead] = await Promise.all');
        expect(functionsSource).toContain('exports.getAdminDashboardSnapshot = onCall(');
        expect(functionsSource).toContain('await assertAdminRequest(request);');
        expect(functionsSource).toContain('db.collection("reports").count().get()');
        expect(functionsSource).toContain('.where("status", "==", "success")');
    });

    it('uses returned row length when a server snapshot has no explicit size override', () => {
        const createAdminSnapshot = loadCreateAdminSnapshot();
        expect(createAdminSnapshot([{ id: 'a' }, { id: 'b' }]).size).toBe(2);
        expect(createAdminSnapshot([{ id: 'a' }], 7).size).toBe(7);
        expect(createAdminSnapshot(null).size).toBe(0);
        expect(adminSource).toContain('const hasSizeOverride = sizeOverride !== null && sizeOverride !== undefined;');
        expect(adminSource).toContain('size: hasSizeOverride && Number.isFinite(Number(sizeOverride))');
        expect(adminSource).toContain(': safeRows.length');
        expect(adminSource).not.toContain('size: Number.isFinite(Number(sizeOverride)) ? Number(sizeOverride) : safeRows.length');
    });

    it('bounds dashboard Firestore reads so one slow source cannot hold the full view blank', () => {
        expect(adminSource).toContain('ADMIN_DASHBOARD_CORE_TIMEOUT_MS');
        expect(adminSource).toContain('ADMIN_DASHBOARD_OPTIONAL_TIMEOUT_MS');
        expect(adminSource).toContain('resolveAdminRead(dailyLogsPromise');
        expect(adminSource).toContain('resolveAdminRead(usersPromise');
        expect(adminSource).toContain("'admin dashboard snapshot'");
        expect(adminSource).toContain('if (!data.partial) cache = { snap: data.snap, usersQ: data.usersQ };');
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

    it('starts every legacy fallback query together instead of waiting through two timeout waves', () => {
        expect(adminSource).toContain("const dailyLogsPromise = getDocs(query(collection(db, 'daily_logs')");
        expect(adminSource).toContain('const [snapRead, usersRead, weekRead, reportsRead] = await Promise.all');
    });
});
