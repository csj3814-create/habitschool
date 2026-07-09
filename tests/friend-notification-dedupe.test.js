import { describe, expect, it } from 'vitest';
import { readAppSource } from './source-helpers.js';

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
