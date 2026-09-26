#!/usr/bin/env node
/**
 * 가입 경로 집계 — 새 회원이 어디서 왔는지 (읽기 전용).
 *
 *   node scripts/signup-sources.mjs [days=14] [prod|staging]
 *
 * 회원 문서의 settings.signupSource(v458~, 가입할 때 첫 방문 기록을 옮김)와
 * referredBy 를 모아 경로별로 센다. 이름·이메일은 읽지도 출력하지도 않는다.
 * 인증은 이 PC 의 Firebase CLI 로그인 (scripts/bug-inbox.mjs 와 같다).
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PROJECTS = { prod: 'habitschool-8497b', staging: 'habitschool-staging' };

/** 첫 방문 기록 하나를 사람이 읽을 경로 이름 하나로 줄인다 (순수 함수 — 테스트 대상). */
export function classifySignupSource(source, referredBy) {
    const s = source || {};
    if (s.src) return s.src;
    if (s.app) return s.app;
    const host = String(s.referrer || '');
    if (/youtube|youtu\.be/.test(host)) return 'youtube';
    if (/naver/.test(host)) return 'naver';
    if (/google/.test(host)) return 'google';
    if (/brunch|daum|kakao/.test(host)) return host.includes('brunch') ? 'brunch' : 'kakao';
    if (/tiktok/.test(host)) return 'tiktok';
    if (/instagram/.test(host)) return 'instagram';
    if (/facebook|fb\.com/.test(host)) return 'facebook';
    if (/threads/.test(host)) return 'threads';
    if (host) return host;
    if (s.ref || referredBy) return 'invite';
    if (!source) return '(기록 없음)';
    return '직접·앱';
}

function accessToken() {
    execSync('firebase projects:list --json', { stdio: ['ignore', 'pipe', 'pipe'] });
    const store = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
    return JSON.parse(fs.readFileSync(store, 'utf8')).tokens.access_token;
}

const plain = (v) => {
    if (!v) return undefined;
    if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, plain(x)]));
    return v.stringValue ?? v.timestampValue ?? v.booleanValue ?? v.integerValue;
};

async function main() {
    const days = Number(process.argv[2] || 14);
    const project = PROJECTS[process.argv[3] || 'prod'];
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const token = accessToken();
    const res = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents:runQuery`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ structuredQuery: {
            from: [{ collectionId: 'users' }],
            where: { fieldFilter: { field: { fieldPath: 'createdAt' }, op: 'GREATER_THAN_OR_EQUAL', value: { timestampValue: since } } },
            select: { fields: [{ fieldPath: 'createdAt' }, { fieldPath: 'referredBy' }, { fieldPath: 'settings.signupSource' }] }
        } })
    });
    const rows = (await res.json()).filter((x) => x.document).map((x) => {
        const f = x.document.fields || {};
        return {
            day: String(plain(f.createdAt) || '').slice(0, 10),
            source: plain(f.settings)?.signupSource,
            referred: !!plain(f.referredBy)
        };
    });
    const counts = {};
    for (const r of rows) {
        const key = classifySignupSource(r.source, r.referred);
        counts[key] = (counts[key] || 0) + 1;
    }
    console.log(`최근 ${days}일 새 회원 ${rows.length}명 (${project})`);
    Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${k.padEnd(14)} ${n}`));
    console.log(`  (초대 연결됨 ${rows.filter((r) => r.referred).length}명)`);
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('signup-sources.mjs')) {
    main().catch((e) => { console.error(e.message); process.exit(1); });
}
