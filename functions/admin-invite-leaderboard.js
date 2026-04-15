function toMillis(value) {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    if (typeof value.toDate === "function") return value.toDate().getTime();
    if (typeof value.seconds === "number") return (value.seconds * 1000) + Math.floor((value.nanoseconds || 0) / 1e6);
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : 0;
}

function unwrapRecord(record = {}) {
    if (record && typeof record.data === "function") {
        return { id: record.id, ...record.data() };
    }
    const data = record && typeof record.data === "object" && record.data !== null
        ? record.data
        : record;
    return { ...data, id: record?.id || data?.id || "" };
}

function getUserLabel(user = {}) {
    return String(user.customDisplayName || user.displayName || user.name || user.id || "").trim();
}

function getInviteSourcePriority(source = "") {
    if (source === "invite_link_existing" || source === "invite_link_signup") return 2;
    if (source === "referredBy") return 1;
    return 0;
}

function getInviteTypeLabel(source = "") {
    return source === "invite_link_existing" ? "기존 회원" : "신규 가입";
}

function pickInviteConnectedAt(data = {}) {
    return data.acceptedAt || data.respondedAt || data.updatedAt || data.createdAt || null;
}

function shouldReplaceInviteEntry(prev = null, next = null) {
    if (!prev) return true;
    const prevPriority = getInviteSourcePriority(prev.source);
    const nextPriority = getInviteSourcePriority(next?.source);
    if (nextPriority !== prevPriority) return nextPriority > prevPriority;
    return toMillis(next?.connectedAt) > toMillis(prev.connectedAt);
}

function buildInviteLeaderboard({ users = [], friendships = [] } = {}) {
    const userMap = new Map();
    users.forEach((rawUser) => {
        const user = unwrapRecord(rawUser);
        if (!user.id) return;
        userMap.set(user.id, user);
    });

    const inviteMap = new Map();
    const upsertInvite = ({
        inviterUid = "",
        inviteeUid = "",
        source = "",
        connectedAt = null,
    } = {}) => {
        const normalizedInviterUid = String(inviterUid || "").trim();
        const normalizedInviteeUid = String(inviteeUid || "").trim();
        if (!normalizedInviterUid || !normalizedInviteeUid || normalizedInviterUid === normalizedInviteeUid) return;

        const inviter = userMap.get(normalizedInviterUid) || { id: normalizedInviterUid };
        const invitee = userMap.get(normalizedInviteeUid) || { id: normalizedInviteeUid };
        const nextEntry = {
            inviterUid: normalizedInviterUid,
            inviterName: getUserLabel(inviter) || normalizedInviterUid.slice(0, 8),
            inviterCode: String(inviter.referralCode || "-"),
            inviteeUid: normalizedInviteeUid,
            inviteeName: getUserLabel(invitee) || normalizedInviteeUid.slice(0, 8),
            inviteeStreak: Number(invitee.currentStreak) || 0,
            inviteeLastLogin: invitee.lastLogin || "",
            source,
            typeLabel: getInviteTypeLabel(source),
            connectedAt,
        };
        const key = `${normalizedInviterUid}::${normalizedInviteeUid}`;
        if (shouldReplaceInviteEntry(inviteMap.get(key), nextEntry)) {
            inviteMap.set(key, nextEntry);
        }
    };

    friendships.forEach((rawFriendship) => {
        const friendship = unwrapRecord(rawFriendship);
        const source = String(friendship.source || "").trim();
        if (friendship.status !== "active") return;
        if (source !== "invite_link_signup" && source !== "invite_link_existing") return;

        const usersInFriendship = Array.isArray(friendship.users)
            ? friendship.users.map((value) => String(value || "").trim()).filter(Boolean)
            : [];
        const inviterUid = String(
            friendship.inviterUid ||
            friendship.referrerUid ||
            friendship.requesterUid ||
            ""
        ).trim();
        const inviteeUid = String(
            friendship.inviteeUid ||
            usersInFriendship.find((candidate) => candidate && candidate !== inviterUid) ||
            ""
        ).trim();

        upsertInvite({
            inviterUid,
            inviteeUid,
            source,
            connectedAt: pickInviteConnectedAt(friendship),
        });
    });

    users.forEach((rawUser) => {
        const user = unwrapRecord(rawUser);
        if (!user.id || !user.referredBy) return;
        upsertInvite({
            inviterUid: user.referredBy,
            inviteeUid: user.id,
            source: "referredBy",
            connectedAt: user.referredByAcceptedAt || user.updatedAt || null,
        });
    });

    const inviterMap = new Map();
    inviteMap.forEach((entry) => {
        const current = inviterMap.get(entry.inviterUid) || {
            uid: entry.inviterUid,
            name: entry.inviterName,
            code: entry.inviterCode,
            successfulInvites: 0,
            latestConnectedAt: null,
            members: [],
        };
        current.successfulInvites += 1;
        current.members.push({
            uid: entry.inviteeUid,
            name: entry.inviteeName,
            streak: entry.inviteeStreak,
            lastLogin: entry.inviteeLastLogin,
            typeLabel: entry.typeLabel,
            source: entry.source,
            connectedAt: entry.connectedAt,
        });
        if (toMillis(entry.connectedAt) > toMillis(current.latestConnectedAt)) {
            current.latestConnectedAt = entry.connectedAt;
        }
        inviterMap.set(entry.inviterUid, current);
    });

    return [...inviterMap.values()]
        .map((row) => ({
            ...row,
            members: row.members.sort((a, b) => {
                const diff = toMillis(b.connectedAt) - toMillis(a.connectedAt);
                if (diff !== 0) return diff;
                return String(a.name || "").localeCompare(String(b.name || ""), "ko");
            }),
        }))
        .sort((a, b) => {
            if (b.successfulInvites !== a.successfulInvites) {
                return b.successfulInvites - a.successfulInvites;
            }
            const latestDiff = toMillis(b.latestConnectedAt) - toMillis(a.latestConnectedAt);
            if (latestDiff !== 0) return latestDiff;
            return String(a.name || "").localeCompare(String(b.name || ""), "ko");
        });
}

module.exports = {
    buildInviteLeaderboard,
};
