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
        expect(appSource).toContain('if (seenIds.has(d.id)) return;');
        expect(appSource).toContain('seenIds.add(d.id);');
        expect(appSource).toContain('writeChallengeNotificationSeenState(uid, {');
        expect(appSource).toContain("showToast(`🤝 ${data.fromUserName || '친구'}님과 연결됐어요!`);");
        expect(appSource).not.toContain('let hasNew = false;');
    });
});
