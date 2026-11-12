"use strict";

/**
 * 관제탑 대시보드 「성장」 — 들어오고, 시작하고, 돌아오는가 (2026-11-12).
 *
 * 이 숫자들은 그동안 대표가 물을 때마다 스크립트로 따로 쟀다(11/8 플레이 회원 복귀,
 * 11/11 안내 메일 효과). 매번 재는 것은 곧 안 재게 된다는 뜻이라 첫 화면에 둔다.
 *
 * 여기는 계산만 한다. 자료는 runtime.js 의 getAdminGrowth 가 모아 넘긴다.
 * 합계만 돌려준다 — 회원 하나를 가리키는 값(uid·이름·이메일)은 내보내지 않는다.
 *
 * 창을 잡는 원칙: **결과가 나올 시간을 준 사람만 센다.** 어제 가입한 사람을 "첫 기록 안 함"
 * 으로 세면 비율이 늘 나쁘게 나오고, 엊그제 보낸 메일을 "안 돌아옴" 으로 세도 마찬가지다.
 */

const DAY_MS = 86400000;

function shift(dateStr, days) {
    return new Date(Date.parse(`${dateStr}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function ratio(part, whole) {
    return whole > 0 ? Math.round((part / whole) * 100) : null;
}

/** [from, to] (포함) 안에 드는가. */
function within(dateStr, from, to) {
    return !!dateStr && dateStr >= from && dateStr <= to;
}

/**
 * @param {object} input
 * @param {string} input.todayStr 오늘(KST) 'YYYY-MM-DD'
 * @param {Array<{uid:string, createdDate:string, referred:boolean, lastAppOpenDate:string}>} input.users
 * @param {Object<string,string[]>} input.logDatesByUid 최근 45일 안의 기록일
 * @param {Array<{uid:string, kind:'lapse2'|'lapse7'|'firstRecord', date:string}>} input.emailSends
 * @param {string[]} input.pushUids 알림을 받을 기기가 하나라도 있는 회원
 */
function buildAdminGrowth({ todayStr, users = [], logDatesByUid = {}, emailSends = [], pushUids = [] } = {}) {
    const hasLogBetween = (uid, from, to) => (logDatesByUid[uid] || []).some((d) => within(d, from, to));

    // ── 1. 들어오는가: 최근 7일 가입 vs 그 앞 7일 ──
    const signups7 = users.filter((u) => within(u.createdDate, shift(todayStr, -6), todayStr)).length;
    const signupsPrev7 = users.filter((u) => within(u.createdDate, shift(todayStr, -13), shift(todayStr, -7))).length;

    // ── 2. 시작하는가: 가입한 지 2~15일 된 분 중 기록을 한 번이라도 남긴 비율 ──
    // 가입 당일·다음 날은 뺀다. 아직 시작할 시간이다(첫 기록 안내도 다음 날 간다).
    const firstRecordOf = (from, to) => {
        const cohort = users.filter((u) => within(u.createdDate, from, to));
        const recorded = cohort.filter((u) => hasLogBetween(u.uid, u.createdDate, todayStr)).length;
        return { signups: cohort.length, recorded, rate: ratio(recorded, cohort.length) };
    };
    const firstRecord = firstRecordOf(shift(todayStr, -15), shift(todayStr, -2));
    const firstRecordPrev = firstRecordOf(shift(todayStr, -29), shift(todayStr, -16));

    // ── 3. 붙는가: 가입 뒤 7일 안에 이틀 이상 기록한 비율 (가입 8~21일 된 분) ──
    const week1Cohort = users.filter((u) => within(u.createdDate, shift(todayStr, -21), shift(todayStr, -8)));
    const week1Kept = week1Cohort.filter((u) => {
        const end = shift(u.createdDate, 6);
        return (logDatesByUid[u.uid] || []).filter((d) => within(d, u.createdDate, end)).length >= 2;
    }).length;

    // ── 4. 쓰고 있는가: 최근 7일 기록한 회원 vs 그 앞 7일 ──
    const activeBetween = (from, to) => Object.keys(logDatesByUid)
        .filter((uid) => hasLogBetween(uid, from, to)).length;
    const active7 = activeBetween(shift(todayStr, -6), todayStr);
    const activePrev7 = activeBetween(shift(todayStr, -13), shift(todayStr, -7));
    const active30Uids = Object.keys(logDatesByUid)
        .filter((uid) => hasLogBetween(uid, shift(todayStr, -29), todayStr));

    // ── 5. 돌아오는가: 안내 메일을 받고 7일 안에 다시 기록한 비율 ──
    // 보낸 지 8~37일 된 메일만 센다(7일을 다 지켜본 것, 최근 한 달치).
    const emailFrom = shift(todayStr, -37);
    const emailTo = shift(todayStr, -8);
    const emails = {};
    for (const kind of ["lapse2", "lapse7", "firstRecord"]) {
        const sends = emailSends.filter((s) => s.kind === kind && within(s.date, emailFrom, emailTo));
        const back = sends.filter((s) => hasLogBetween(s.uid, s.date, shift(s.date, 7))).length;
        emails[kind] = { sent: sends.length, back, rate: ratio(back, sends.length) };
    }

    // ── 6. 다시 부를 수 있는가: 최근 30일 기록한 회원 중 알림이 연결된 비율 ──
    const pushSet = new Set(pushUids);
    const pushConnected = active30Uids.filter((uid) => pushSet.has(uid)).length;

    // ── 7. 알려지는가: 최근 30일 가입자 중 친구 초대로 온 비율, 플레이 앱으로 쓰는 회원 ──
    const signups30 = users.filter((u) => within(u.createdDate, shift(todayStr, -29), todayStr));
    const referred30 = signups30.filter((u) => u.referred).length;
    const playApp30 = users.filter((u) => within(u.lastAppOpenDate, shift(todayStr, -29), todayStr)).length;

    return {
        todayStr,
        signups: { last7: signups7, prev7: signupsPrev7 },
        firstRecord: { ...firstRecord, prevRate: firstRecordPrev.rate, prevSignups: firstRecordPrev.signups },
        week1: { signups: week1Cohort.length, kept: week1Kept, rate: ratio(week1Kept, week1Cohort.length) },
        active: { last7: active7, prev7: activePrev7, last30: active30Uids.length },
        emails,
        push: { active30: active30Uids.length, connected: pushConnected, rate: ratio(pushConnected, active30Uids.length) },
        spread: { signups30: signups30.length, referred30, referredRate: ratio(referred30, signups30.length), playApp30 },
    };
}

module.exports = { buildAdminGrowth };
