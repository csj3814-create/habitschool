import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 마일스톤 보상은 **두 곳에 따로 적혀 있다.**
//
//   js/firebase-config.js   MILESTONES             → 화면에 "+50P 받기" 로 그려진다
//   functions/runtime.js    MILESTONE_DEFINITIONS  → 실제로 coins 를 올린다
//
// 런타임 공유가 안 된다 — 브라우저는 ESM, Functions 는 CommonJS 이고, 배포되는
// functions/ 는 상위 폴더를 가져가지 않는다 (media-hosts 와 같은 사정).
//
// 한쪽만 고치면 버튼에는 50P 라고 적혀 있는데 20P 가 들어온다. 회원은 지급이
// 틀렸다는 걸 알 방법이 없고, 우리도 원장을 뒤지기 전에는 모른다.
//
// **이 시험은 숫자를 스스로 적지 않는다.** 적어 두면 세 번째 사본이 된다.
// 두 파일에서 읽어서 서로 맞는지만 본다.

const CLIENT = readRepoFile('js/firebase-config.js');
const SERVER = readRepoFile('functions/runtime.js');

/** js/firebase-config.js 의 MILESTONES 에서 { id, target, reward } 를 읽는다. */
function clientMilestones() {
    const block = CLIENT.split('export const MILESTONES = {')[1];
    expect(block, 'MILESTONES 정의를 찾지 못했다').toBeTruthy();
    const body = block.split('\n};')[0];
    const rows = [...body.matchAll(
        /\{\s*id:\s*'([^']+)'[^}]*?target:\s*(\d+),\s*reward:\s*(\d+)\s*\}/g
    )].map((m) => ({ id: m[1], target: Number(m[2]), reward: Number(m[3]) }));
    expect(rows.length, '클라이언트 마일스톤을 하나도 읽지 못했다').toBeGreaterThan(0);
    return rows;
}

/** functions/runtime.js 의 MILESTONE_DEFINITIONS 에서 같은 것을 읽는다. */
function serverMilestones() {
    const block = SERVER.split('const MILESTONE_DEFINITIONS = Object.freeze([')[1];
    expect(block, 'MILESTONE_DEFINITIONS 정의를 찾지 못했다').toBeTruthy();
    const body = block.split('].map(')[0];
    const rows = [...body.matchAll(/\["([^"]+)",\s*"[^"]+",\s*(\d+),\s*(\d+)\]/g)]
        .map((m) => ({ id: m[1], target: Number(m[2]), reward: Number(m[3]) }));
    expect(rows.length, '서버 마일스톤을 하나도 읽지 못했다').toBeGreaterThan(0);
    return rows;
}

describe('마일스톤 정의는 화면과 지급이 같아야 한다', () => {
    const client = clientMilestones();
    const server = serverMilestones();

    it('같은 마일스톤을 같은 수만큼 가진다', () => {
        expect(server.map((row) => row.id).sort()).toEqual(client.map((row) => row.id).sort());
    });

    it('목표와 보상이 한 줄도 어긋나지 않는다', () => {
        const serverById = new Map(server.map((row) => [row.id, row]));
        client.forEach((row) => {
            expect(serverById.get(row.id), `서버에 ${row.id} 가 없다`).toEqual(row);
        });
    });

    it('보상은 모두 양수다', () => {
        // 0P 짜리 마일스톤은 "받기" 버튼을 눌러도 아무 일이 없다.
        client.forEach((row) => expect(row.reward, `${row.id} 보상이 0 이하`).toBeGreaterThan(0));
    });

    it('한 카테고리 안에서 목표가 커지면 보상도 줄지 않는다', () => {
        // 7일차가 14일차보다 많이 주면 회원은 더 오래 버틸 이유를 잃는다.
        const byPrefix = new Map();
        client.forEach((row) => {
            const prefix = row.id.replace(/\d+$/, '');
            if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
            byPrefix.get(prefix).push(row);
        });
        byPrefix.forEach((rows, prefix) => {
            const sorted = [...rows].sort((a, b) => a.target - b.target);
            sorted.forEach((row, index) => {
                if (index === 0) return;
                expect(row.reward, `${prefix}: ${sorted[index - 1].id} 보다 ${row.id} 가 적게 준다`)
                    .toBeGreaterThanOrEqual(sorted[index - 1].reward);
            });
        });
    });
});
