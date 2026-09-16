import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(resolve(ROOT_DIR, 'js/app-core.js'), 'utf8');
const FOLLOW_UPS = APP
    .split('const runPostSaveFollowUps = async ({ forceGalleryRefresh = false, dailyLogData = saveData } = {}) => {')[1]
    .split('\n            };')[0];

// 2026-09-16 제보: "아직도 챌린지 완료 직후에는 정산 확인중 뜨고 앱을 나갔다
// 들어와야 정산 가능하게 바뀌네."
//
// 저장 후 후속 작업 넷이 한 try 로 묶여 있고 catch (_) {} 로 삼켰다. 앞의
// checkMilestones 나 renderMilestones 가 한 번 실패하면 그 뒤의
// updateChallengeProgress 가 아예 실행되지 않는다. 서버 재계산이 안 되니 화면은
// '정산 확인 중…' 에 머물고, 다음 로그인 때까지 풀리지 않았다.
describe('a finished challenge settles without leaving the app', () => {
    it('does not let a milestone failure skip the challenge refresh', () => {
        // 둘이 같은 try 에 있으면 앞이 던질 때 뒤가 통째로 건너뛴다.
        // 이름이 아니라 순서를 본다 — 이름만 세면 주석에 언급하는 순간 깨진다.
        const milestoneCatch = FOLLOW_UPS.indexOf('마일스톤 갱신 실패');
        const challengeCall = FOLLOW_UPS.indexOf('await updateChallengeProgress({');
        expect(milestoneCatch).toBeGreaterThan(-1);
        expect(challengeCall).toBeGreaterThan(-1);
        // 마일스톤 try 가 먼저 닫히고, 그 뒤에 챌린지가 따로 선다.
        expect(milestoneCatch).toBeLessThan(challengeCall);
    });

    it('still refreshes the challenge when milestones blow up', () => {
        // 마일스톤 try 가 자기 자리에서 닫히고, 챌린지가 그 뒤에 따로 선다.
        const afterMilestones = FOLLOW_UPS.split('마일스톤 갱신 실패')[1];
        expect(afterMilestones).toContain('try {');
        expect(afterMilestones).toContain('await updateChallengeProgress({');
    });

    it('says why it failed instead of swallowing it', () => {
        // CLAUDE.md 2026-08-15: "오류를 삼키는 catch 는 이런 종류의 침묵을 만든다."
        // 이 제보의 consoleEntries 가 비어 있던 이유이기도 하다.
        expect(FOLLOW_UPS).toContain("console.warn('[저장 후] 마일스톤 갱신 실패:'");
        expect(FOLLOW_UPS).toContain("console.warn('[저장 후] 챌린지 진행도 갱신 실패:'");
        expect(FOLLOW_UPS).not.toContain('} catch (_) {}');
    });

    it('keeps asking while the card still says it is checking', () => {
        // 화면이 "정산 확인 중" 이라고 말하는 순간마다 재계산을 부른다.
        expect(APP).toContain("requestAssetChallengeProgressSync(\n                    auth.currentUser?.uid, todayStr, 'challenge-awaiting-settlement')");
    });

    it('redraws the card after the server recalculates', () => {
        const manager = readFileSync(resolve(ROOT_DIR, 'js/blockchain-manager.js'), 'utf8');
        const fn = manager.split('export async function updateChallengeProgress(options = {}) {')[1].split('\n}')[0];
        expect(fn).toContain("refreshAssetDisplayAfterChallengeMutation('challenge-progress')");
    });
});
