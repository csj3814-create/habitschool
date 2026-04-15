import { describe, expect, it } from 'vitest';
import leaderboardModule from '../functions/admin-invite-leaderboard.js';

const { buildInviteLeaderboard } = leaderboardModule;

describe('buildInviteLeaderboard', () => {
    it('counts invite-link signups and existing-member invite connections together without double counting', () => {
        const rows = buildInviteLeaderboard({
            users: [
                { id: 'inviter', displayName: '초대한 사람', referralCode: 'ABC123' },
                { id: 'signup-user', displayName: '신규 회원', referredBy: 'inviter', currentStreak: 4 },
                { id: 'existing-user', displayName: '기존 회원', currentStreak: 2 },
            ],
            friendships: [
                {
                    id: 'friendship-signup',
                    status: 'active',
                    source: 'invite_link_signup',
                    inviterUid: 'inviter',
                    inviteeUid: 'signup-user',
                    acceptedAt: '2026-04-15T09:00:00Z',
                },
                {
                    id: 'friendship-existing',
                    status: 'active',
                    source: 'invite_link_existing',
                    inviterUid: 'inviter',
                    inviteeUid: 'existing-user',
                    acceptedAt: '2026-04-15T10:00:00Z',
                },
            ],
        });

        expect(rows).toHaveLength(1);
        expect(rows[0].name).toBe('초대한 사람');
        expect(rows[0].successfulInvites).toBe(2);
        expect(rows[0].members.map((member) => member.name)).toEqual(['기존 회원', '신규 회원']);
        expect(rows[0].members.map((member) => member.typeLabel)).toEqual(['기존 회원', '신규 가입']);
    });

    it('falls back to referredBy when a legacy signup friendship document is missing', () => {
        const rows = buildInviteLeaderboard({
            users: [
                { id: 'inviter', displayName: '레거시 초대자', referralCode: 'LEGACY' },
                { id: 'legacy-user', displayName: '레거시 가입자', referredBy: 'inviter', currentStreak: 1 },
            ],
            friendships: [],
        });

        expect(rows).toHaveLength(1);
        expect(rows[0].successfulInvites).toBe(1);
        expect(rows[0].members[0].name).toBe('레거시 가입자');
        expect(rows[0].members[0].typeLabel).toBe('신규 가입');
    });
});
