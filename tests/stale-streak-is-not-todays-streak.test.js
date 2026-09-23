import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';
import { resolveStoredStreak } from '../js/activity-days.js';
import { buildAdminPrescriptionDrafts } from '../js/admin-utils.js';

// 2026-09-23: `users/{uid}.currentStreak` 이 낡아 있었다.
//
// 그 필드는 **기록을 저장할 때만** 쓰인다. 그만둔 사람에게는 쓰는 순간이 오지
// 않으므로 값이 마지막 기록일에 멈춘 채 남는다. 저장된 값의 뜻은 "오늘의 연속" 이
// 아니라 **"lastLogDate 시점의 연속"** 이다.
//
// 운영 측정: currentStreak > 0 인 121명 중 어제·오늘 기록한 사람은 14명.
// 81명은 마지막 기록이 46일 넘게 지났고, 180일 전에 멈춘 사람이 currentStreak = 2.
//
// 연속 알림은 2026-09-23 에 daily_logs 로 대상을 고르도록 고쳤지만
// (tests/streak-alert-targets-live-streaks.test.js), **필드 자체는 그대로 틀렸고
// 다른 곳에서 읽히고 있었다.** 가장 나쁜 자리는 회원에게 그대로 나가는 처방 축하
// 카드였다 — 46일 쉰 분께 "30일 연속으로 기록하고 계십니다" 를 보낼 수 있었다.
//
// 고치는 방식: 리셋을 쓸 사건이 없다(값을 틀리게 만드는 것은 사건의 부재다).
// 대신 lastLogDate 와 함께 읽어 **읽는 자리에서 환산한다.**

const FRESHNESS = readRepoFile('functions/streak-freshness.js');
const RUNTIME = readRepoFile('functions/runtime.js');
const COMMUNITY = readRepoFile('functions/community-stats.js');
const INVITES = readRepoFile('functions/admin-invite-leaderboard.js');
const ADMIN_UTILS = readRepoFile('js/admin-utils.js');
const AUTH_HELPERS = readRepoFile('js/auth-login-helpers.js');

/** functions/ 의 CommonJS 모듈을 원문 그대로 돌린다. 요약본이 아니라 실제 코드다. */
function loadCommonJsModule(source) {
    const module = { exports: {} };
    new Function('module', 'exports', 'require', source)(module, module.exports, () => {
        throw new Error('이 모듈은 아무것도 require 하지 않아야 한다');
    });
    return module.exports;
}

const server = loadCommonJsModule(FRESHNESS);

describe('저장된 연속 기록을 오늘의 값으로 환산한다', () => {
    // 서버(CommonJS)와 앱(ESM)에 같은 규칙이 한 벌씩 있다. 갈라지면 화면과 메일이
    // 서로 다른 말을 하게 되므로, 두 구현에 같은 표를 먹인다.
    const implementations = [
        ['functions/streak-freshness.js', server.resolveStoredStreak],
        ['js/activity-days.js', resolveStoredStreak],
    ];

    for (const [label, resolve] of implementations) {
        describe(label, () => {
            it('어제 기록했으면 살아 있다 — 오늘은 아직 남았다', () => {
                expect(resolve({ currentStreak: 12, lastLogDate: '2026-09-22' }, '2026-09-23')).toBe(12);
            });

            it('오늘 기록했으면 살아 있다', () => {
                expect(resolve({ currentStreak: 12, lastLogDate: '2026-09-23' }, '2026-09-23')).toBe(12);
            });

            it('그저께가 마지막이면 이미 끊겼다', () => {
                // 어제 하루를 통째로 건너뛴 사람이다. 오늘의 연속은 0 이다.
                expect(resolve({ currentStreak: 12, lastLogDate: '2026-09-21' }, '2026-09-23')).toBe(0);
            });

            it('운영에서 나온 최악의 경우 — 180일 전에 멈춘 2일 연속', () => {
                expect(resolve({ currentStreak: 2, lastLogDate: '2026-03-27' }, '2026-09-23')).toBe(0);
            });

            it('달을 넘어가도 "어제" 를 맞게 센다', () => {
                // 문자열 비교로 어제를 구하면 월초에서 틀린다.
                expect(resolve({ currentStreak: 40, lastLogDate: '2026-08-31' }, '2026-09-01')).toBe(40);
                expect(resolve({ currentStreak: 40, lastLogDate: '2026-08-30' }, '2026-09-01')).toBe(0);
            });

            it('lastLogDate 가 없으면 살아 있다고 보지 않는다', () => {
                // 언제 기록했는지 모르는 값을 살아 있다고 우길 근거가 없다.
                expect(resolve({ currentStreak: 9 }, '2026-09-23')).toBe(0);
                expect(resolve({ currentStreak: 9, lastLogDate: '' }, '2026-09-23')).toBe(0);
            });

            it('오늘을 모르면 판단하지 않고 저장값을 그대로 둔다', () => {
                // 날짜를 모르는 채로 0 을 만들면 멀쩡한 연속까지 지운다.
                expect(resolve({ currentStreak: 9, lastLogDate: '2026-09-23' }, '')).toBe(9);
            });

            it('저장값이 0 이거나 이상하면 0 이다', () => {
                expect(resolve({ currentStreak: 0, lastLogDate: '2026-09-23' }, '2026-09-23')).toBe(0);
                expect(resolve({ currentStreak: -5, lastLogDate: '2026-09-23' }, '2026-09-23')).toBe(0);
                expect(resolve({}, '2026-09-23')).toBe(0);
                expect(resolve(null, '2026-09-23')).toBe(0);
            });
        });
    }
});

describe('축하 카드는 회원에게 그대로 나간다', () => {
    const TODAY = '2026-09-23';

    /** 점수를 받은 날의 기록 한 건. 서버가 연속을 셀 때 쓰는 기준과 같다. */
    const activeLog = (date) => ({
        date,
        awardedPoints: { dietPoints: 10, exercisePoints: 10, mindPoints: 10 },
    });

    const streakDraft = (drafts) => drafts.find((draft) => draft.key === 'streak');

    it('어제까지 이어온 분께는 축하한다', () => {
        const drafts = buildAdminPrescriptionDrafts({
            logs: [activeLog('2026-09-22'), activeLog('2026-09-21'), activeLog('2026-09-20')],
            streak: 30,
            todayStr: TODAY,
        });
        expect(streakDraft(drafts)?.summary).toBe('30일 연속 기록, 축하드립니다');
    });

    it('46일 전에 멈춘 분께 "30일 연속 축하" 를 만들지 않는다', () => {
        // 이것이 실제로 가능했던 일이다. 재료(users.currentStreak)가 낡은 채로
        // 들어오면 문장은 그대로 만들어졌고, 카드는 회원에게 나간다.
        const drafts = buildAdminPrescriptionDrafts({
            logs: [activeLog('2026-08-08'), activeLog('2026-08-07')],
            streak: 30,
            todayStr: TODAY,
        });
        expect(streakDraft(drafts)).toBeUndefined();
        expect(JSON.stringify(drafts)).not.toContain('연속으로 기록하고 계십니다');
    });

    it('주간 대기열처럼 점수가 실리지 않은 기록도 살아 있는 것으로 본다', () => {
        // PRESCRIPTION_QUEUE_*_FIELDS 는 문서를 줄이느라 awardedPoints 를 싣지
        // 않는다. 점수로 판단했다면 그 경로에서 축하가 통째로 사라지고도 아무
        // 신호가 없었을 것이다. 이 확인이 막아야 하는 것은 간격이지 점수가 아니다.
        const drafts = buildAdminPrescriptionDrafts({
            logs: [{ date: '2026-09-22' }],
            streak: 30,
            todayStr: TODAY,
        });
        expect(streakDraft(drafts)?.summary).toBe('30일 연속 기록, 축하드립니다');
    });

    it('부르는 쪽이 이미 0 으로 환산해 줘도 결과는 같다', () => {
        // 재료 쪽(buildAdminPrescriptionQueue)도 고쳤으므로 보통은 0 이 들어온다.
        // 두 겹 중 하나만 남아도 카드는 나가지 않아야 한다.
        const drafts = buildAdminPrescriptionDrafts({
            logs: [activeLog('2026-08-08')],
            streak: 0,
            todayStr: TODAY,
        });
        expect(streakDraft(drafts)).toBeUndefined();
    });
});

describe('저장값을 그대로 읽던 자리들', () => {
    it('친구 활동 카드 — 반년 전에 그만둔 친구가 "2일 연속" 으로 보이지 않는다', () => {
        const readiness = RUNTIME.split('exports.getFriendActivityReadiness')[1].split('\n);')[0];
        expect(readiness).toContain('resolveStoredStreak(profile, todayKstForStreak)');
        expect(readiness).not.toContain('Number(profile.currentStreak || 0) || 0');
    });

    it('관제탑 회원 목록 — 화면 일곱 곳이 이 한 곳을 본다', () => {
        const memberList = RUNTIME.split('async function buildAdminMemberList()')[1].split('\n}\n')[0];
        expect(memberList).toContain('currentStreak: resolveStoredStreak(data, todayKstForStreak)');
        expect(memberList).not.toContain('currentStreak: data.currentStreak || 0');
    });

    it('관제탑 대시보드 TOP20 — 환산에 필요한 lastLogDate 를 같이 읽는다', () => {
        const dashboard = RUNTIME.split('exports.getAdminDashboardSnapshot')[1].split('\n);')[0];
        expect(dashboard).toContain('"lastLogDate"');
        expect(dashboard).toContain('currentStreak: resolveStoredStreak(data, todayStr)');
    });

    it('주간 처방 재료 — 회원에게 보낼 문장의 숫자다', () => {
        const queue = RUNTIME.split('async function buildAdminPrescriptionQueue(todayStr)')[1].split('\n}\n')[0];
        expect(queue).toContain('"lastLogDate"');
        expect(queue).toContain('streak: resolveStoredStreak(user, todayStr)');
    });

    it('커뮤니티 "N일 이상 M명" — 이 달로 좁히는 것만으로는 모자랐다', () => {
        const collect = COMMUNITY.split('async function collectCurrentStreaks(')[1].split('\n}\n')[0];
        expect(collect).toContain('fieldMask: ["currentStreak", "lastLogDate"]');
        expect(collect).toContain('resolveStoredStreak(snap.data() || {}, todayKst)');
        // 부르는 쪽이 오늘을 건네지 않으면 환산이 조용히 꺼진다.
        expect(RUNTIME).not.toContain('collectCurrentStreaks(db, activeUserIds)');
    });

    it('초대 성과표', () => {
        expect(INVITES).toContain('resolveStoredStreak(invitee, todayStr)');
        expect(RUNTIME).toContain('todayStr: getCurrentKstDateString(),');
    });
});

describe('일부러 저장값을 그대로 보는 자리', () => {
    it('hasStartedRecording 은 환산하지 않는다', () => {
        // 이 함수가 묻는 것은 "지금 연속인가" 가 아니라 "한 번이라도 기록했나" 다.
        // 환산하면 오래 쉰 회원이 '기록한 적 없는 사람' 이 되어 온보딩이 다시 뜬다.
        const helper = AUTH_HELPERS.split('export function hasStartedRecording(')[1].split('\n}\n')[0];
        expect(helper).toContain('(Number(userData?.currentStreak) || 0) > 0');
        expect(helper).not.toContain('resolveStoredStreak');
        // 왜 예외인지가 코드 옆에 남아 있어야 다음 사람이 '고치지' 않는다.
        expect(AUTH_HELPERS).toContain('여기서만은 낡은 값이 맞는 값이다');
    });
});

describe('기록을 저장할 때 회원 문서의 연속도 맞춘다', () => {
    const AWARD = RUNTIME.split('exports.awardPoints = onDocumentWritten(')[1].split('\n);')[0];

    it('서버가 직접 쓴다 — 앱이 refreshMilestones 를 불러 주기를 기다리지 않는다', () => {
        // 이 필드를 쓰던 곳은 refreshMilestones 하나뿐이었다. 46일 쉬었다 돌아와
        // 기록을 저장해도, 앱이 그 호출을 하기 전까지는 옛 연속이 남아 있었다.
        expect(AWARD).toContain('.set({ currentStreak: todayStreak }, { merge: true })');
    });

    it('쓰는 값도 읽는 규칙과 같은 함수를 지난다', () => {
        // 한 달 전 기록을 뒤늦게 넣으면 그 날짜 기준 연속이 나온다. 그것을 '지금'
        // 으로 저장하면 낡은 값을 새로 하나 만드는 셈이다.
        expect(AWARD).toContain('const todayStreak = resolveStoredStreak(');
        expect(AWARD).toContain('{ currentStreak: streak, lastLogDate: logDate },');
    });

    it('가장 최근 기록일 때만 쓴다', () => {
        // 지난 기록을 나중에 고치면 그 날짜 기준으로 센 연속이 '지금' 값으로 박힌다.
        // lastLogDate 를 앞으로만 미는 것과 같은 규칙이다.
        expect(AWARD).toContain('if (logDate >= knownLastLogDate) {');
        expect(AWARD).toContain('const knownLastLogDate = String(previousLogState?.lastLogDate || "");');
    });

    it('실패를 삼키되 로그는 남긴다', () => {
        // 2026-08-15: 오류를 삼키는 catch 때문에 쓰기 거부가 나흘간 성공처럼 보였다.
        expect(AWARD).toContain('currentStreak 갱신 실패');
    });
});

describe('환산 규칙은 두 벌이어도 한 가지여야 한다', () => {
    it('서버 모듈은 아무것도 require 하지 않는다 — 어디서든 돌릴 수 있어야 한다', () => {
        // 백필 스크립트가 이 파일을 그대로 가져다 쓴다. 지우는 근거와 화면에
        // 보이는 근거가 같은 코드여야 한다.
        expect(FRESHNESS).not.toContain('require(');
        expect(readRepoFile('scripts/reset-stale-streaks-2026-09-23.js'))
            .toContain('"functions", "streak-freshness"');
    });

    it('백필은 lastLogDate 가 없는 회원을 건드리지 않는다', () => {
        // 건드리면 hasStartedRecording 의 근거가 사라져 온보딩이 다시 뜬다.
        const script = readRepoFile('scripts/reset-stale-streaks-2026-09-23.js');
        expect(script).toContain('if (!DATE.test(lastLogDate)) { skippedNoDate += 1; return; }');
        expect(script).toContain('hasStartedRecording');
    });

    it('축하 카드의 확인은 기록을 본다 — 부르는 쪽 숫자를 믿지 않는다', () => {
        const guard = ADMIN_UTILS.split('function isStreakStillAlive(')[1].split('\n}\n')[0];
        expect(guard).toContain('recentLogs(logs, 2, todayStr).length > 0');
        // 점수로 판단하면 주간 대기열에서 모두가 조용히 탈락한다.
        expect(guard).not.toContain('awardedPoints');
        expect(ADMIN_UTILS).toContain('if (streakDays >= 7 && isStreakStillAlive(logs, todayStr)) {');
    });
});
