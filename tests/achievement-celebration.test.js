import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');

// 소모임 100회와 미션 배지는 서버가 자동으로 준다. 누를 것이 없으니 챌린지와 달리
// "수령하기"가 아니라 "확인했어요"이고, 도달한 뒤 처음 화면을 볼 때 한 번만 뜬다.
// 며칠 지나 알려주면 축하가 아니라 알림이 된다.
describe('achievements that pay themselves still get a moment', () => {
    const app = read('js/app-core.js');
    const index = read('index.html');

    it('has a sheet with nothing to claim', () => {
        expect(index).toContain('id="achievement-modal"');
        expect(index).toContain('onclick="dismissAchievementCelebration()"');
        expect(index).toContain('>확인했어요</button>');
        // 챌린지 시트의 모양을 그대로 쓴다. 축하가 두 가지로 보일 이유가 없다.
        expect(index).toContain('class="modal-content challenge-reward-sheet"');
    });

    it('shows each achievement once', () => {
        const fn = app.split('window.celebrateAchievementsOnce =')[1].split('\n};\n')[0];
        expect(fn).toContain('const seen = getCelebratedAchievementIds(uid);');
        expect(fn).toContain('!seen.has(item.id)');
        // 띄우기 전에 표시해야 도중에 닫히거나 새로고침돼도 되풀이되지 않는다.
        const markAt = fn.indexOf('markAchievementCelebrated(uid, item.id)');
        const showAt = fn.indexOf('renderAchievementCelebration(first)');
        expect(markAt).toBeGreaterThan(-1);
        expect(markAt).toBeLessThan(showAt);
    });

    it('queues rather than stacking when several land together', () => {
        const fn = app.split('window.celebrateAchievementsOnce =')[1].split('\n};\n')[0];
        expect(fn).toContain('_achievementQueue = _achievementQueue.concat(rest);');
        expect(fn).toContain("if (modal.style.display === 'flex') return;");
        const dismiss = app.split('window.dismissAchievementCelebration =')[1].split('\n};\n')[0];
        expect(dismiss).toContain('_achievementQueue.shift()');
    });

    it('celebrates only badges earned this time', () => {
        expect(app).toContain('const justEarnedBadges = newBadges.filter((badgeId) => !existingBadges.includes(badgeId));');
        // 저장이 실패하면 축하할 것도 없다.
        const saveAt = app.indexOf('await setDoc(doc(db, "users", uid), updateData, { merge: true });');
        const celebrateAt = app.indexOf('if (justEarnedBadges.length > 0) {');
        expect(saveAt).toBeLessThan(celebrateAt);
    });

    it('celebrates a group only once its reward is actually paid', () => {
        expect(app).toContain("if (joined && progressSummary.rewardStatus === 'paid') {");
        expect(app).toContain('id: `group-reward:${group.id}`');
        // 받은 금액은 화면이 지어내지 않고 진행 기록에 있는 값을 쓴다.
        expect(app).toContain("rewardValue: `${progressSummary.rewardPoints.toLocaleString('ko-KR')}P`");
    });

    it('keeps the seen list on the device and bounded', () => {
        const app2 = read('js/app-core.js');
        expect(app2).toContain("const CELEBRATED_ACHIEVEMENTS_KEY_PREFIX = 'hs_celebrated_';");
        expect(app2).toContain('.slice(-200)');
        // 저장소를 못 읽는 브라우저에서도 화면이 멈추면 안 된다.
        const getter = app2.split('function getCelebratedAchievementIds(')[1].split('\n}\n')[0];
        expect(getter).toContain('catch (_)');
    });
});
