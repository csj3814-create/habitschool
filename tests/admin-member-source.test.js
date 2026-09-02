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
        // 앞선 날짜만 앞으로 민다. 이전 값은 복귀 판정에 쓰이므로 그대로 돌려준다.
        expect(fn).toContain('if (known >= logDate) return previous;');
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

// 스테이징에서 "추이를 불러오지 못했습니다 (setInfo is not defined)" 로 표가 통째로 비었다.
// openDetail 안의 지역 함수를 나중에 도착한 추이가 부르려 했기 때문이다.
describe('프로필 다시 그리기', () => {
    it('setInfo 는 모듈 스코프에 있다', () => {
        expect(ADMIN).toContain('function setInfo(id, value, measuredOn) {');
        expect(ADMIN).not.toContain('const setInfo = (id, value, measuredOn)');
    });

    it('추이가 도착하면 프로필을 다시 그린다', () => {
        expect(ADMIN).toContain('decorateProfileWithMeasurements(hp, memberTrendPayload);');
    });
});

// 좌측 열은 프로필 아래로 처방·포인트 조정·발송 이력이 이어져 모달보다 길다.
// 스크롤을 걷어냈더니 '포인트 수동 조정' 아래가 아예 닿지 않았다.
describe('모달 좌측 열', () => {
    it('스크롤을 유지한다', () => {
        expect(ADMIN).toContain('<div style="overflow-y:auto;padding-right:4px;">');
    });
});

describe('최근 기록일 백필', () => {
    it('서버에서 도는 버튼으로 돌릴 수 있다', () => {
        // 스크립트는 실행하는 사람 PC 에 자격증명이 있어야 한다.
        expect(RUNTIME).toContain('exports.backfillLastLogDate = onCall(');
        expect(ADMIN).toContain('window.runLastLogDateBackfill');
        expect(ADMIN).toContain('onclick="runLastLogDateBackfill(true)"');
    });

    it('여러 번 눌러도 이미 최신인 회원은 건너뛴다', () => {
        const fn = RUNTIME.split('exports.backfillLastLogDate = onCall(')[1].split('\n);')[0];
        expect(fn).toContain('if (known >= latest) { alreadyCurrent += 1; return; }');
    });

    it('먼저 확인만 할 수 있다', () => {
        const fn = RUNTIME.split('exports.backfillLastLogDate = onCall(')[1].split('\n);')[0];
        expect(fn).toContain('if (dryRun) return summary;');
    });
});

// 관제탑을 처음 열 때 회원 목록이 나오기까지 15.7초가 걸렸다(운영 실측).
// 두 번째부터는 0.7초 — 함수가 깨어나는 시간과 첫 집계 비용이었다.
describe('회원 목록을 빨리 만든다', () => {
    it('목록이 쓰는 필드만 읽는다', () => {
        // 회원 문서에는 healthProfile·milestones·missionHistory 처럼 목록이 한 번도
        // 보지 않는 것들이 들어 있다. 606개를 통째로 읽으면 그게 전부 따라온다.
        expect(RUNTIME).toContain('db.collection("users").select(...ADMIN_MEMBER_FIELDS).get()');
        expect(RUNTIME).toContain('db.collection("emailLogs").select(...ADMIN_EMAIL_LOG_FIELDS).get()');
    });

    it('보낸 메일 본문은 읽지 않는다', () => {
        const fields = RUNTIME.split('const ADMIN_EMAIL_LOG_FIELDS = [')[1].split('];')[0];
        expect(fields).not.toContain('lastSentHtml');
        expect(fields).toContain('lastSentAt');
    });

    it('한 화면에서 두 번 부르지 않는다', () => {
        // 대시보드 소스 경로와 getData 경로가 각자 불러, 깨어나는 값을 두 번 치렀다.
        expect(ADMIN).toContain('let adminMemberSnapshotInFlight = null;');
        expect(ADMIN).toContain('if (!force && adminMemberSnapshotInFlight) return adminMemberSnapshotInFlight;');
    });
});

// 회원이 607명인데 화면이 "총 0명" 이라고 말한 제보가 있었다. 목록이 아직 안 왔을
// 뿐인데, 불러오는 중과 아무도 없는 것을 같은 문장으로 말하고 있었다.
describe('빈 목록의 이유를 구분해 말한다', () => {
    it('불러오는 중에는 인원수를 말하지 않는다', () => {
        expect(ADMIN).toContain("memberListState === 'loading'");
        expect(ADMIN).toContain("'회원 목록을 불러오는 중…'");
        expect(ADMIN).toContain("'회원 목록을 불러오지 못했습니다'");
    });

    it('실패하면 다시 시도할 수 있다', () => {
        expect(ADMIN).toContain('window.reloadMemberList');
        expect(ADMIN).toContain('다시 시도');
    });

    it('아직 안 받아왔으면 "조건에 맞는 회원 없음" 이라고 하지 않는다', () => {
        expect(ADMIN).toContain("if (memberListState !== 'ready') { renderMemberPagination(0); return; }");
    });

    it('회원 목록은 대시보드보다 오래 기다린다', () => {
        // 9초는 Firestore 를 직접 읽던 시절의 값이다. 콜러블은 깨어나는 데만 몇 초가
        // 걸릴 수 있고, 그때 빈 목록을 받느니 기다리는 편이 낫다.
        expect(ADMIN).toContain('const ADMIN_MEMBER_FETCH_TIMEOUT_MS = 25000;');
        expect(ADMIN).toContain("resolveAdminRead(usersPromise, 'users', EMPTY_ADMIN_QUERY_SNAPSHOT, ADMIN_MEMBER_FETCH_TIMEOUT_MS)");
    });
});
