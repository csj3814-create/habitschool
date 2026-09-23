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
        // 2026-09-23: 저장된 연속 기록은 마지막 기록일의 값이라 그대로 실으면
        // 반년 전에 그만둔 친구가 '2일 연속' 으로 보인다. 오늘의 값으로 환산해서
        // 싣되, 위쪽 한도는 그대로 둔다 — 투영은 여전히 최소한이어야 한다.
        expect(runtimeSource).toContain('currentStreak: Math.min(3650, resolveStoredStreak(profile,');
        expect(runtimeSource).not.toContain('logs: logsByFriend.get(friendId) || [],\n                email:');
    });
});
