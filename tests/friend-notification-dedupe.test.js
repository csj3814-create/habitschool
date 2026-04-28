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
        expect(appSource).toContain("data.type === 'friend_connected' && ts > 0 && nowMs - ts > FRIEND_CONNECTED_TOAST_MAX_AGE_MS");
        expect(appSource).toContain('seenIds.add(d.id);');
        expect(appSource).toContain('writeChallengeNotificationSeenState(uid, {');
        expect(appSource).toContain("showToast(`🤝 ${data.fromUserName || '친구'}님과 연결됐어요!`);");
        expect(appSource).not.toContain('let hasNew = false;');
    });
});
