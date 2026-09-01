import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

const ADMIN = readRepoFile('admin.html');
const RUNTIME = readRepoFile('functions/runtime.js');

// 관제탑은 열 때마다 users 컬렉션을 통째로 읽었다. 회원 606명이면 606건이고,
// 소비처가 다섯 곳이라 회원이 늘면 그대로 늘어난다.
describe('회원 목록을 통째로 읽지 않는다', () => {
    it('users 컬렉션 전체 읽기가 남아 있지 않다', () => {
        expect(ADMIN).not.toContain("getDocs(collection(db, 'users'))");
    });

    it('emailLogs 컬렉션 전체 읽기도 없앴다', () => {
        // 문서마다 보낸 메일 본문이 들어 있어, 목록을 열 때마다 그만큼 내려받았다.
        expect(ADMIN).not.toContain("getDocs(collection(db, 'emailLogs'))");
        expect(ADMIN).toContain('getNormalizedEmailLog(m.emailLog || {}');
    });

    it('서버가 준 목록을 기존 소비처 모양으로 감싼다', () => {
        // 다섯 곳을 전부 고쳐 쓰는 대신 forEach(u => u.data()) 모양을 유지한다.
        expect(ADMIN).toContain('function toMemberSnapshot(members)');
        expect(ADMIN).toContain('callback({ id: member.uid, data: () => member })');
        expect(ADMIN).toContain('const usersPromise = fetchAdminMemberSnapshot();');
    });

    it('서버는 목록에 healthProfile 을 싣지 않는다', () => {
        // 한 명 열 때만 필요한 값이다. 목록에 넣으면 606배가 된다.
        const fn = RUNTIME.split('async function buildAdminMemberList() {')[1].split('\n}\n')[0];
        expect(fn).not.toContain('healthProfile');
        expect(fn).toContain('blockedUsers: blocked.slice(0, 3)');
        expect(fn).toContain('blockedCount: blocked.length');
    });

    it('잘라 온 차단 목록을 개수로 착각하지 않는다', () => {
        expect(ADMIN).toContain('Number(d.blockedCount ?? d.blockedUsers?.length ?? 0)');
    });
});

// 목록의 '최근 기록일' 은 daily_logs 500건 창에서 나왔다. 하루 20~30건이면 그 창은
// 최근 20~25일이고, 그보다 오래 쉰 회원은 날짜가 빈칸으로 보인다.
describe('최근 기록일이 조회 창에 매여 있지 않다', () => {
    it('회원 문서의 lastLogDate 를 먼저 쓴다', () => {
        expect(ADMIN).toContain("date: m.lastLogDate || r.date || '-',");
    });

    it('기록이 들어오면 트리거가 적어 둔다', () => {
        expect(RUNTIME).toContain('await updateUserLastLogDate(userId, logDate);');
    });

    it('지난 기록을 고쳐도 최근 기록일이 뒤로 가지 않는다', () => {
        const fn = RUNTIME.split('async function updateUserLastLogDate(userId, logDate) {')[1].split('\n}')[0];
        expect(fn).toContain('if (known >= logDate) return;');
    });

    it('갱신이 실패해도 포인트 정산을 재시도시키지 않는다', () => {
        const fn = RUNTIME.split('async function updateUserLastLogDate(userId, logDate) {')[1].split('\n}')[0];
        expect(fn).toContain('} catch (error) {');
        expect(fn).not.toContain('throw');
    });
});

describe('건강 추이는 서버 한 곳에서 계산한다', () => {
    it('관제탑에 같은 계산을 다시 두지 않는다', () => {
        // 개인 화면과 코호트 화면이 같은 규칙을 쓴다. 두 벌이 되면 조용히 갈라진다.
        expect(ADMIN).not.toContain('function summarizeChange');
        expect(ADMIN).not.toContain('function aggregateWeekly');
        expect(ADMIN).toContain("httpsCallable(fns, 'getHealthTrends')");
    });

    it('uid 를 주면 한 명, 안 주면 코호트', () => {
        const fn = RUNTIME.split('exports.getHealthTrends = onCall(')[1].split('\n);')[0];
        expect(fn).toContain('if (uid) {');
        expect(fn).toContain('loadMemberHealthTrends(uid, todayStr)');
        expect(fn).toContain('loadCohortHealthTrends(todayStr)');
    });

    it('코호트는 회원마다 질의하지 않는다', () => {
        const fn = RUNTIME.split('async function loadCohortHealthTrends(todayStr) {')[1].split('\n}\n')[0];
        expect(fn).toContain('db.collection("daily_logs").where("date", ">=", since).get()');
    });

    it('개인 추이는 캐시하지 않는다', () => {
        // 방금 들어온 기록이 안 보이는 편이 더 나쁘다.
        const fn = RUNTIME.split('exports.getHealthTrends = onCall(')[1].split('\n);')[0];
        const memberBranch = fn.split('if (uid) {')[1].split('}')[0];
        expect(memberBranch).not.toContain('cache');
    });
});
