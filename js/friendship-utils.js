// 친구관계 순수 헬퍼 (app-core.js에서 추출)
//
// 인자만으로 결과가 결정되는 순수 함수들 — 전역 상태(cachedMyFriendships, auth)를
// 읽는 함수(getActiveFriendIds 등)는 app-core에 남기고, 이 순수 술어들만 분리해
// 테스트 가능하게 한다. 모놀리스(app-core.js) 축소의 안전한 첫 단계.

// Firestore Timestamp / Date / 문자열 / 숫자를 Date로 안전 변환. 실패 시 null.
export function toDateSafe(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value?.toDate === 'function') return value.toDate();
    if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
}

// 친구관계 문서에서 상대방 uid 추출.
export function getFriendshipOtherUid(friendship, myUid) {
    const users = Array.isArray(friendship?.users) ? friendship.users : [];
    return users.find(uid => uid !== myUid) || null;
}

// pending 요청이 만료 시각을 지났는지.
export function isFriendshipExpired(friendship) {
    if (!friendship || friendship.status !== 'pending') return false;
    const expiresAt = toDateSafe(friendship.expiresAt);
    return !!expiresAt && expiresAt.getTime() < Date.now();
}

// 만료를 반영한 실효 상태('expired' 승격 포함).
export function getEffectiveFriendshipStatus(friendship) {
    if (!friendship) return 'none';
    if (friendship.status === 'pending' && isFriendshipExpired(friendship)) return 'expired';
    return friendship.status || 'none';
}

// 상대방 표시 이름(없으면 '친구').
export function getFriendshipName(friendship, myUid) {
    const otherUid = getFriendshipOtherUid(friendship, myUid);
    if (!otherUid) return '친구';
    return friendship?.userNames?.[otherUid]
        || (friendship.requesterUid === otherUid ? friendship.requesterName : null)
        || '친구';
}
