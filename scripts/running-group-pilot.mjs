#!/usr/bin/env node
/**
 * 달리기 모임 시범 집계 (읽기 전용). 합계만 출력한다. 이름·이메일·uid 는 출력하지 않는다.
 *
 *   node scripts/running-group-pilot.mjs [prod|staging]
 *
 * 대표가 운영진 단톡방에 매주 전할 숫자(몇 명이 몇 번, 몇 km)와 4주 뒤 판단 기준
 * (모임에 든 신규 20명, 첫 인증 60%, 4주째 기록 40%)을 본다.
 * 인증은 이 PC 의 Firebase CLI 로그인 (scripts/signup-sources.mjs 와 같다).
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PROJECTS = { prod: 'habitschool-8497b', staging: 'habitschool-staging' };
const GROUP_ID = 'exercise-runbickers';
const NEW_MEMBER_DAYS = 7; // 모임에 들어오기 전 7일 안에 가입했으면 이 모임으로 온 신규로 본다.

function accessToken() {
    execSync('firebase projects:list --json', { stdio: ['ignore', 'pipe', 'pipe'] });
    const store = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
    return JSON.parse(fs.readFileSync(store, 'utf8')).tokens.access_token;
}

const plain = (v) => {
    if (!v) return undefined;
    if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, plain(x)]));
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return Number(v.doubleValue);
    return v.stringValue ?? v.timestampValue ?? v.booleanValue;
};

async function query(base, token, collectionId, fieldPath, value, fields) {
    const res = await fetch(`${base}:runQuery`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ structuredQuery: {
            from: [{ collectionId }],
            where: { fieldFilter: { field: { fieldPath }, op: 'EQUAL', value: { stringValue: value } } },
            select: { fields: fields.map((name) => ({ fieldPath: name })) }
        } })
    });
    return (await res.json())
        .filter((row) => row.document)
        .map((row) => Object.fromEntries(Object.entries(row.document.fields || {}).map(([k, v]) => [k, plain(v)])));
}

/** 'YYYY-MM-DD' 를 그 주 월요일로. */
function weekOf(date) {
    const day = new Date(`${date}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
    return day.toISOString().slice(0, 10);
}

const percent = (a, b) => (b ? `${a}/${b} (${Math.round((a / b) * 100)}%)` : `${a}/0`);

async function main() {
    const project = PROJECTS[process.argv[2] || 'prod'];
    if (!project) throw new Error('prod 또는 staging 만 받습니다.');
    const token = accessToken();
    const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;

    const members = await query(base, token, 'habit_group_members', 'groupId', GROUP_ID, ['uid', 'active', 'joinedAt']);
    const checkins = await query(base, token, 'habit_group_checkins', 'groupId', GROUP_ID, ['uid', 'date', 'runKm', 'reviewStatus']);
    const progress = await query(base, token, 'exercise_group_reward_progress', 'groupId', GROUP_ID, ['uid', 'rewardStatus', 'approvedCount']);
    const approved = checkins.filter((item) => item.reviewStatus === 'approved');

    console.log(`런비커스 모임 (${project})`);
    console.log(`  들어온 회원 ${members.length}명 · 지금 활동 ${members.filter((m) => m.active !== false).length}명`);

    const uids = [...new Set(members.map((m) => m.uid).filter(Boolean))];
    const docs = await Promise.all(uids.map(async (uid) => {
        const res = await fetch(`${base}/users/${uid}?mask.fieldPaths=createdAt&mask.fieldPaths=referredBy`, { headers: { Authorization: `Bearer ${token}` } });
        const json = await res.json();
        return { uid, createdAt: plain(json.fields?.createdAt), referred: !!plain(json.fields?.referredBy) };
    }));
    const joinedAt = new Map(members.map((m) => [m.uid, Date.parse(m.joinedAt || '')]));
    const newMembers = docs.filter((d) => {
        const created = Date.parse(d.createdAt || '');
        return Number.isFinite(created) && joinedAt.get(d.uid) - created <= NEW_MEMBER_DAYS * 86400000;
    });
    const checkedIn = new Set(approved.map((item) => item.uid));
    console.log(`  모임으로 온 신규 ${newMembers.length}명 (기준 20명), 초대 코드 연결 ${docs.filter((d) => d.referred).length}명`);
    console.log(`  신규 첫 인증 ${percent(newMembers.filter((d) => checkedIn.has(d.uid)).length, newMembers.length)} (기준 60%)`);

    const weeks = new Map();
    approved.forEach((item) => {
        const key = weekOf(item.date);
        const week = weeks.get(key) || { people: new Set(), runs: 0, km: 0 };
        week.people.add(item.uid);
        week.runs += 1;
        week.km += Number(item.runKm) || 0;
        weeks.set(key, week);
    });
    console.log('  주별 (월요일 기준):');
    [...weeks.keys()].sort().forEach((key) => {
        const week = weeks.get(key);
        console.log(`    ${key}  ${week.people.size}명 · ${week.runs}번 · ${week.km.toFixed(1)}km`);
    });

    const status = {};
    progress.forEach((item) => { status[item.rewardStatus || 'none'] = (status[item.rewardStatus || 'none'] || 0) + 1; });
    const paid = status.paid || 0;
    console.log(`  완주 ${paid}명 · 진행 상태 ${JSON.stringify(status)}`);
    console.log(`  완주 포인트 ${paid * 1000}P, 받은 참가비 ${members.length * 200}P`);
}

main().catch((error) => { console.error(error.message); process.exit(1); });
