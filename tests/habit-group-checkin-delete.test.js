import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');
const APP = read('js/app-core.js');
const RULES = read('firestore.rules');
const SYNC = APP
    .split('async function syncHabitGroupCheckinsForDailyLog({')[1]
    .split('\n}')[0];

// 2026-09-17: 하루 전에 넣은 로그가 바로 잡아냈다.
//
//   [소모임] 미완료 체크인 삭제 실패: Missing or insufficient permissions.
//     syncHabitGroupCheckinsForDailyLog  app-core.js:27018
//
// 규칙은 delete 를 resource.data.uid == request.auth.uid 로 판단한다. 문서가
// 없으면 resource 가 null 이라 그 식을 세울 수 없고, 없는 것을 지우려던 호출이
// 전부 permission-denied 로 돌아왔다. 체크인이 없는 날 기록을 저장할 때마다
// 가입한 소모임 수만큼 헛걸음했다.
describe('we do not try to delete a check-in that is not there', () => {
    it('checks what it already read before calling delete', () => {
        // existingCheckin 은 이 함수가 위에서 이미 읽어 둔 값이다. 답을 갖고
        // 있었는데 삭제 분기가 보지 않았다.
        expect(SYNC).toContain('existingCheckin = existingCheckinSnap.exists()');
        // 'return;' 에서 자르면 가드 자체가 잘려 나간다. 삭제 호출까지를 본다.
        const beforeDelete = SYNC.split('if (!status.complete) {')[1].split('await deleteDoc(checkinRef)')[0];
        expect(beforeDelete).toContain('if (!existingCheckin) return;');
    });

    it('guards before the call, not after', () => {
        const deleteBranch = SYNC.split('if (!status.complete) {')[1];
        const guard = deleteBranch.indexOf('if (!existingCheckin) return;');
        const call = deleteBranch.indexOf('await deleteDoc(checkinRef)');
        expect(guard).toBeGreaterThan(-1);
        expect(call).toBeGreaterThan(-1);
        expect(guard).toBeLessThan(call);
    });

    it('still reports a delete that genuinely fails', () => {
        // 문서가 있는데 못 지우면 미완료 체크인이 남아 집계가 어긋난다.
        // 그때는 여전히 말해야 한다 — 이 로그가 이 버그를 찾아냈다.
        expect(SYNC).toContain("console.error('[소모임] 미완료 체크인 삭제 실패:'");
    });

    it('counts only the ones it actually removed', () => {
        expect(SYNC).toContain('.then(() => { removed += 1; })');
    });

    it('leaves the rule alone — the rule was right', () => {
        // 고칠 자리는 규칙이 아니라 호출하는 쪽이었다. 규칙은 남의 체크인을
        // 지우지 못하게 막는 제 일을 하고 있다.
        const block = RULES.split('match /habit_group_checkins/{checkinId} {')[1].split('}')[0];
        expect(block).toContain('allow delete: if isSignedIn()');
        expect(block).toContain('resource.data.uid == request.auth.uid');
    });
});
