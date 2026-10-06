#!/usr/bin/env node
/**
 * 이미 지급한 월간 MVP 보상에 알림을 붙인다 (한 번만 돌리는 정리 도구).
 *
 * 2026-10-02 제보: "커뮤니티 현황 통해 받는 포인트는 축하 박스도 안뜨고 포인트
 * 리스트에도 안 떠." 지급 함수가 코인만 올리고 아무것도 남기지 않았다. 함수는
 * 이제 지급 때 notifications/mvp_<달>_<회원> 을 남긴다. 그 전에 지급한 달은 이
 * 도구로 같은 문서를 만든다 — 포인트는 건드리지 않는다.
 *
 * 문서 id 가 같으므로 두 번 돌려도 하나만 남는다(있으면 건너뛴다).
 * 축하 창은 지급 30일 안의 것만 뜬다. 지난달 것은 기록에만 나온다.
 *
 * 사용법
 *   node scripts/backfill-mvp-reward-notifications.mjs <prod|staging>          → 무엇을 만들지 보여만 준다
 *   node scripts/backfill-mvp-reward-notifications.mjs <prod|staging> --write  → 실제로 만든다
 *
 * 인증: 이 PC 의 Firebase CLI 로그인 (scripts/bug-inbox.mjs 와 같다).
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PROJECTS, plain } from './bug-inbox.mjs';

function accessToken() {
    execSync('firebase projects:list --json', { stdio: ['ignore', 'pipe', 'pipe'] });
    const store = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
    const token = JSON.parse(fs.readFileSync(store, 'utf8'))?.tokens?.access_token;
    if (!token) throw new Error('Firebase CLI 토큰을 찾지 못했습니다 (firebase login).');
    return token;
}

/** 지급 기록 하나에서 만들 알림들. (순수 함수 — 테스트 대상) */
export function buildMvpRewardNotifications(month, reward = {}) {
    const winners = Array.isArray(reward.winners) ? reward.winners : [];
    return winners
        .filter((w) => w && w.userId && Number(w.reward) > 0)
        .map((w, index) => ({
            id: `mvp_${month}_${w.userId}`,
            fields: {
                postOwnerId: w.userId,
                type: 'mvp_reward',
                month,
                rank: Number(w.rank) || index + 1,
                bonusPoints: Number(w.reward),
                createdAt: reward.distributedAt || null
            }
        }));
}

function toValue(value) {
    if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    if (value === null) return { nullValue: null };
    return { stringValue: String(value) };
}

async function main([projectKey, flag]) {
    const projectId = PROJECTS[projectKey];
    if (!projectId) throw new Error('prod 또는 staging 을 적어 주세요.');
    const write = flag === '--write';
    const token = accessToken();
    const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    const list = await (await fetch(`${base}/monthly_rewards?pageSize=100`, { headers })).json();
    let created = 0;
    let skipped = 0;
    for (const docItem of list.documents || []) {
        const month = docItem.name.split('/').pop();
        const reward = Object.fromEntries(Object.entries(docItem.fields || {}).map(([k, v]) => [k, plain(v)]));
        for (const note of buildMvpRewardNotifications(month, reward)) {
            const exists = (await fetch(`${base}/notifications/${note.id}`, { headers })).status === 200;
            if (exists) { skipped += 1; continue; }
            console.log(`${write ? '만듦' : '만들 것'}: ${note.id} ${note.fields.rank}위 +${note.fields.bonusPoints}P`);
            if (!write) { created += 1; continue; }
            const fields = {};
            for (const [key, value] of Object.entries(note.fields)) {
                fields[key] = key === 'createdAt' && value ? { timestampValue: value } : toValue(value);
            }
            const response = await fetch(`${base}/notifications?documentId=${encodeURIComponent(note.id)}`, {
                method: 'POST', headers, body: JSON.stringify({ fields })
            });
            if (!response.ok) throw new Error(`${note.id}: ${response.status} ${await response.text()}`);
            created += 1;
        }
    }
    console.log(`${write ? '만든' : '만들'} 알림 ${created}개, 이미 있어 건너뜀 ${skipped}개${write ? '' : ' — 실제로 만들려면 --write'}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
    main(process.argv.slice(2)).catch((error) => {
        console.error('backfill 실패:', error.message);
        process.exit(1);
    });
}
