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
        expect(fn).toContain('seen.has(item.id)');
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

    // 2026-09-21 제보: "폰에서 확인했던 배지 축하가 새 컴퓨터로 로그인하니까
    // 처음부터 다시 다 뜨네?" 확인한 사실이 기기에만 남아 있었다. 축하는 기기의
    // 일이 아니라 그 사람의 일이므로 계정으로 옮긴다. 아래 시험은 "기기에만
    // 남긴다" 를 못 박고 있던 예전 시험을 대신한다 — 지우지 않고 뜻을 바꿔 쓴다.
    it('remembers on the account, not just this device', () => {
        expect(app).toContain("const CELEBRATED_ACHIEVEMENTS_KEY_PREFIX = 'hs_celebrated_';");
        expect(app).toContain('.slice(-200)');
        // 저장소를 못 읽는 브라우저에서도 화면이 멈추면 안 된다.
        const getter = app.split('function getCelebratedAchievementIds(')[1].split('\n}\n')[0];
        expect(getter).toContain('catch (_)');
        // 계정 기록과 기기 기록을 합쳐서 본다.
        expect(getter).toContain('_celebratedServerUid === uid && _celebratedServerIds');

        const mark = app.split('function markAchievementCelebrated(')[1].split('\n}\n')[0];
        // 두 기기가 동시에 확인해도 서로의 항목을 지우지 않게 arrayUnion 을 쓴다.
        expect(mark).toContain('celebratedAchievements: arrayUnion(achievementId)');
        // 규칙 화이트리스트에 이미 있는 settings 안에 넣는다 — 규칙 배포가 필요 없다.
        expect(mark).toContain('settings: {');
        // 조용히 실패하면 축하가 기기를 옮길 때마다 되풀이되는데 화면은 멀쩡하다.
        expect(mark).toContain('console.warn');
    });

    it('waits for the account list before celebrating anything', () => {
        const fn = app.split('window.celebrateAchievementsOnce =')[1].split('\n};\n')[0];
        // 계정 기록을 듣기 전에 띄우면 다른 기기에서 확인한 축하가 또 뜬다.
        expect(fn).toContain('if (_celebratedServerUid !== uid || !_celebratedServerIds) {');
        expect(fn).toContain('_celebratedPending.push(item)');
        const holdAt = fn.indexOf("if (_celebratedServerUid !== uid || !_celebratedServerIds) {");
        const seenAt = fn.indexOf('const seen = getCelebratedAchievementIds(uid);');
        expect(holdAt).toBeLessThan(seenAt);
    });

    it('still celebrates when the account list never arrives', () => {
        // 축하를 영영 삼키는 것보다 한 번 더 보는 쪽이 낫다.
        const fn = app.split('window.celebrateAchievementsOnce =')[1].split('\n};\n')[0];
        expect(fn).toContain('CELEBRATED_SERVER_WAIT_MS');
        expect(fn).toContain('flushPendingAchievementCelebrations();');
        expect(app).toContain('const CELEBRATED_SERVER_WAIT_MS = 5000;');
    });

    it('is told the account list from the document sign-in already reads', () => {
        const auth = read('js/auth.js');
        // 조회를 하나 더 하지 않는다. resolveLatestUserDocData 가 가져온 답을 쓴다.
        expect(auth).toContain('window.primeCelebratedAchievements?.(');
        expect(auth).toContain('resolvedUserData?.settings?.celebratedAchievements || []');
        // 화면이 그려지기 전에 알려 줘야 한다.
        const primeAt = auth.indexOf('window.primeCelebratedAchievements?.(');
        const uiAt = auth.indexOf('await applySignedInUserUi(user, ud);');
        expect(primeAt).toBeGreaterThan(-1);
        expect(primeAt).toBeLessThan(uiAt);
    });

    it('shows a repeated item only once inside one batch', () => {
        // 소모임 카드는 화면을 다시 그릴 때마다 같은 항목을 보낸다. 계정 기록을
        // 기다리는 동안 그것이 쌓이면 같은 축하가 두 장 뜬다.
        const fn = app.split('window.celebrateAchievementsOnce =')[1].split('\n};\n')[0];
        expect(fn).toContain('picked.has(item.id)');
        expect(fn).toContain('!_celebratedPending.some((waiting) => waiting.id === item.id)');
    });
});
