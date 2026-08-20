import { describe, expect, it } from 'vitest';
import { readAppSource, readFunctionsSource } from './source-helpers.js';

describe('friend connection notification dedupe', () => {
    it('deduplicates friend_connected toasts by notification document id as well as timestamp', () => {
        const appSource = readAppSource();

        expect(appSource).toContain('const CHALLENGE_NOTIFICATION_SEEN_ID_LIMIT = 80;');
        expect(appSource).toContain('const _seenChallengeNotificationIdsByUid = new Map();');
        expect(appSource).toContain('function readChallengeNotificationSeenState(uid)');
        expect(appSource).toContain('function writeChallengeNotificationSeenState(uid');
        expect(appSource).toContain('const seenIds = seenState.ids;');
        expect(appSource).toContain('function isChallengeNotificationServerSeen(data = {})');
        expect(appSource).toContain("function markChallengeNotificationClientSeen(notificationId, uid, reason = 'toast-shown')");
        expect(appSource).toContain('clientSeenAt: serverTimestamp()');
        expect(appSource).toContain('const locallySeen = seenIds.has(d.id);');
        expect(appSource).toContain('silentlyConsumedNotifications.push({ id: d.id });');
        expect(appSource).toContain("markChallengeNotificationClientSeen(id, uid, 'toast-shown')");
        // 오래된 알림은 종류와 무관하게 뒤늦게 토스트되지 않도록 조용히 소비한다.
        expect(appSource).toContain("if (ts > 0 && nowMs - ts > NOTIFICATION_TOAST_MAX_AGE_MS) return true;");
        expect(appSource).toContain('seenIds.add(d.id);');
        expect(appSource).toContain('writeChallengeNotificationSeenState(uid, {');
        expect(appSource).toContain("showToast(`🤝 ${data.fromUserName || '친구'}님과 연결됐어요!`);");
        expect(appSource).not.toContain('let hasNew = false;');
    });
});

describe('친구 연결 알림이 상대 이름을 보여준다', () => {
    // 알림은 초대·추천한 쪽이 받는다. 그런데 담기는 이름이 받는 사람 자신이라
    // "최석재님과 이제 함께 기록할 수 있어요" 를 최석재 본인이 받았다.
    it('추천 가입·초대 링크 모두 상대 이름을 싣는다', () => {
        const source = readFunctionsSource();

        // 자기 이름을 싣던 형태가 다시 나타나면 안 된다.
        expect(source).not.toContain('friendName: outcome.inviterName');

        // 세 경로 모두 받는 사람이 아닌 상대의 이름을 쓴다.
        const sent = source.match(/friendName: outcome\.\w+/g) || [];
        expect(sent.length).toBeGreaterThanOrEqual(3);
        sent.forEach((line) => {
            expect(['friendName: outcome.inviteeName', 'friendName: outcome.responderName'])
                .toContain(line);
        });
    });

    it('상대 이름이 반환값에 실려 나온다', () => {
        const source = readFunctionsSource();
        // 추천 가입 경로는 가입한 사람, 초대 링크 경로는 링크를 쓴 사람.
        expect(source).toContain('inviteeName,');
        expect(source).toContain('inviteeName: userName,');
    });
});
