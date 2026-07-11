import { describe, expect, it } from 'vitest';
import { readAppSource, readFunctionsSource } from './source-helpers.js';

describe('private daily log client boundary', () => {
    it('uses the server readiness projection instead of reading a friend daily log', () => {
        const appSource = readAppSource();

        expect(appSource).toContain("httpsCallable(functions, 'getFriendActivityReadiness')");
        expect(appSource).toContain('fetchSocialChallengeReadinessLogsByDocId(activeFriendIds, [todayStr])');
        expect(appSource).toContain('fetchSocialChallengeReadinessLogsByDocId(friendIds, [todayStr])');
        expect(appSource).not.toContain("getDoc(doc(db, 'daily_logs', `${fid}_${todayStr}`))");
        expect(appSource).not.toContain("getDoc(doc(db, 'daily_logs', docId))");
        expect(appSource).not.toContain("getDoc(doc(db, 'users', fid))");
    });

    it('authorizes active friends and returns only the minimal activity projection', () => {
        const runtimeSource = readFunctionsSource();

        expect(runtimeSource).toContain('exports.getFriendActivityReadiness = onCall(');
        expect(runtimeSource).toContain('const authorizedFriendIds = new Set(await getActiveFriendIds(uid));');
        expect(runtimeSource).toContain('authorizedFriendIds.has(friendId)');
        expect(runtimeSource).toContain('awardedPoints: awarded');
        expect(runtimeSource).toContain('displayName,');
        expect(runtimeSource).toContain('currentStreak: Math.max(0, Math.min(3650');
        expect(runtimeSource).not.toContain('logs: logsByFriend.get(friendId) || [],\n                email:');
    });
});
