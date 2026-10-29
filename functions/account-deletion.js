/**
 * 회원 탈퇴 시 실제로 데이터를 지운다.
 *
 * 예전에는 클라이언트가 직접 지웠는데, 두 가지가 구조적으로 불가능했다.
 *  - Storage 폴더 삭제: 웹 SDK에는 프리픽스 삭제가 없다. listAll로 훑어야 하는데
 *    코드가 가리키던 `uploads/{uid}`는 애초에 업로드 경로가 아니어서 사진이 한 장도
 *    지워지지 않았다.
 *  - 남의 문서 수정: 내가 남긴 댓글과 반응은 다른 사람의 게시물 안에 들어 있어
 *    보안 규칙상 클라이언트가 손댈 수 없다.
 *
 * 그래서 서버에서 관리자 권한으로 처리한다.
 */

const { onCall: baseOnCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
// 콜러블이 던진 오류 문장에 영어를 싣는다(functions/error-messages.js, 해외 3단계 E6-2).
const { localizedOnCall } = require("./error-messages");
const onCall = localizedOnCall(baseOnCall);
const admin = require("firebase-admin");

// admin.initializeApp()은 runtime.js가 부른다. 이 파일이 먼저 로드돼도 터지지 않도록
// 실제로 쓸 때 가져온다.
const getDb = () => admin.firestore();
const { FieldValue, Timestamp } = admin.firestore;

// 탈퇴할 때 "30일 보관 후 삭제"를 고른 회원의 보관함. 클라이언트 규칙이 없어 서버만 닿는다.
// 설계: tasks/2026-10-29_account_deletion_grace.md
const HOLDS = "account_holds";
const HOLD_DAYS = 30;
const PENDING_CLAIM = "accountDeletionPending";

// 보관 중에는 다른 회원·관리자·알림·통계가 닿지 않아야 한다. 그 길은 모두 아래 문서에서
// 출발한다 — 회원 조회(관리자 목록·메일·푸시·월간 보상)는 users 를, 남이 보는 화면은
// 갤러리·친구·공유 카드·그룹 가입을 읽는다. 이것만 보관함으로 옮기면 읽는 쪽은 고칠 게 없다.
// daily_logs·point_ledger·habit_group_checkins 는 트리거가 걸려 있어 옮겼다 되돌리면
// 포인트와 그룹 진행이 다시 계산될 수 있다. 본인·관리자만 읽으므로 제자리에 둔다.
const HELD_QUERIES = Object.freeze([
    ["gallery_posts", "userId", "=="],
    ["share_cards", "userId", "=="],
    ["habit_group_members", "uid", "=="],
    ["friendships", "users", "array-contains"],
]);
const HELD_DOCS_BY_UID = Object.freeze(["users", "health_profiles"]);

// 업로드가 실제로 쓰는 경로. 썸네일까지 빠짐없이 적는다.
const STORAGE_PREFIXES = Object.freeze([
    "diet_images",
    "diet_images_thumbnails",
    "exercise_images",
    "exercise_images_thumbnails",
    "exercise_videos",
    "exercise_videos_thumbnails",
    "sleep_images",
    "sleep_images_thumbnails",
    "step_screenshots",
    "blood_tests",
    "body_composition",
    "bug_reports",
    "share_cards",
    "reward_coupons",
]);

// (컬렉션, 사용자 필드[, 함께 지울 하위 문서]) 묶음. 한 컬렉션이 여러 필드로 사람을
// 가리키면 여러 번 돈다. 문서를 지워도 하위 컬렉션은 남는다 — 감사 일기·명상 기록은
// daily_logs/{id}/private/mind 에 따로 있어서, 부모만 지우던 동안 그대로 남았다(2026-10-29).
// storage.rules·firestore.rules 와의 대조는 tests/account-deletion.test.js 가 맡는다.
const OWNED_QUERIES = Object.freeze([
    ["daily_logs", "userId", ["private/mind"]],
    ["gallery_posts", "userId"],
    ["notifications", "postOwnerId"],
    ["notifications", "fromUserId"],
    ["reaction_point_ledger", "reactorUserId"],
    ["reaction_point_ledger", "postOwnerId"],
    ["share_cards", "userId"],
    ["habit_group_members", "uid"],
    ["habit_group_checkins", "uid"],
    // 아래 둘은 전자상거래법상 보존 대상일까 봐 남겨두고 있었다. 이 서비스에는
    // 현금 결제가 없고 사업자 등록도 없어 그 의무의 적용 대상이 아니라고 정리했다.
    // 남길 근거가 없으면 남기지 않는다 — 탈퇴는 탈퇴여야 한다.
    // (블록체인에 기록된 거래 자체는 어차피 지울 수 없다. 여기서 지우는 것은
    //  우리가 들고 있던 사본뿐이고, 그 점은 약관과 방침에 적혀 있다.)
    ["blockchain_transactions", "userId"],
    ["reward_redemptions", "userId"],
    // 서버가 쓰는 원장들. 포인트를 셈하는 데만 쓰였고 회원이 떠나면 셀 일도 없다.
    // point_ledger 는 entries 하위 컬렉션이 있어 아래 deletePointLedgers 가 따로 맡는다.
    ["reward_evidence_ledger", "userId"],
    ["step_verifications", "userId"],
    ["notification_delivery_ledger", "userId"],
    ["exercise_group_reward_progress", "uid"],
    // 회원이 낸 것들. 오류 제보에는 기기 정보와 콘솔 기록이, 신고에는 신고한 사람이 들어 있다.
    ["bug_reports", "uid"],
    ["reports", "reporterUid"],
    ["admin_feedback", "targetUserId"],
    // 지금 코드는 쓰지 않지만 규칙이 남아 있는 옛 컬렉션. 예전 기록이 있을 수 있다.
    ["reactions", "userId"],
]);

// 문서 id 가 곧 uid 인 문서들.
const OWNED_DOCS_BY_UID = Object.freeze([
    "emailLogs",
    "admin_messages",
    "health_profiles",
]);

const REACTION_TYPES = Object.freeze(["heart", "fire", "clap"]);

// 지금은 비어 있다. 예전에는 blockchain_transactions 와 reward_redemptions 를
// 전자상거래법상 보존 대상일까 봐 남겼는데, 검토 결과 남길 근거가 없어 OWNED_QUERIES 로
// 옮겼다. 앞으로 법령상 보존 의무가 확인된 컬렉션이 생기면 여기에 적는다.
// 개인정보처리방침에도 같은 내용이 적혀 있어야 한다 —
// tests/policy-documents-match-code.test.js 가 그 일치를 지킨다.
const RETAINED_COLLECTIONS = Object.freeze([]);

const QUERY_PAGE_SIZE = 300;
const BATCH_SIZE = 400;

/**
 * 조건에 맞는 문서를 남김없이 지운다.
 * 예전 클라이언트 코드는 배치 두 개(500+500)만 돌려서 1,000건이 넘으면 초과분이
 * 그대로 남았다. 여기서는 더 나올 게 없을 때까지 페이지를 넘긴다.
 */
async function deleteQueryFully(collectionName, field, value, childDocPaths = []) {
    let deleted = 0;
    for (;;) {
        const snap = await getDb().collection(collectionName)
            .where(field, "==", value)
            .limit(QUERY_PAGE_SIZE)
            .get();
        if (snap.empty) break;

        let batch = getDb().batch();
        let inBatch = 0;
        for (const docSnap of snap.docs) {
            // 없는 하위 문서를 지워도 오류가 나지 않는다.
            for (const childPath of childDocPaths) {
                batch.delete(getDb().doc(`${docSnap.ref.path}/${childPath}`));
                inBatch += 1;
            }
            batch.delete(docSnap.ref);
            inBatch += 1;
            if (inBatch >= BATCH_SIZE) {
                await batch.commit();
                batch = getDb().batch();
                inBatch = 0;
            }
        }
        if (inBatch > 0) await batch.commit();
        deleted += snap.size;

        // 페이지 크기보다 적게 나왔으면 마지막 장이다.
        if (snap.size < QUERY_PAGE_SIZE) break;
    }
    return deleted;
}

/**
 * point_ledger/{uid}_{날짜 | bonuses | milestones} 와 그 entries 하위 컬렉션.
 * 부모 문서를 쿼리로 찾고, 날짜가 없는 두 문서는 id 로도 한 번 더 짚는다 —
 * 부모가 없이 entries 만 남은 경우도 recursiveDelete 가 훑는다.
 */
async function deletePointLedgers(uid) {
    const refs = new Map();
    for (const suffix of ["bonuses", "milestones"]) {
        const ref = getDb().doc(`point_ledger/${uid}_${suffix}`);
        refs.set(ref.path, ref);
    }
    let cursor = null;
    for (;;) {
        let q = getDb().collection("point_ledger").where("userId", "==", uid).orderBy("__name__").limit(QUERY_PAGE_SIZE);
        if (cursor) q = q.startAfter(cursor);
        const snap = await q.get();
        snap.docs.forEach((docSnap) => refs.set(docSnap.ref.path, docSnap.ref));
        if (snap.size < QUERY_PAGE_SIZE) break;
        cursor = snap.docs[snap.docs.length - 1];
    }
    for (const ref of refs.values()) {
        await getDb().recursiveDelete(ref);
    }
    return refs.size;
}

async function deleteFriendships(uid) {
    let deleted = 0;
    for (;;) {
        const snap = await getDb().collection("friendships")
            .where("users", "array-contains", uid)
            .limit(QUERY_PAGE_SIZE)
            .get();
        if (snap.empty) break;
        const batch = getDb().batch();
        snap.docs.forEach((docSnap) => batch.delete(docSnap.ref));
        await batch.commit();
        deleted += snap.size;
        if (snap.size < QUERY_PAGE_SIZE) break;
    }
    return deleted;
}

/**
 * 남의 게시물에 남긴 흔적을 지운다.
 * 반응은 uid 배열이라 array-contains로 바로 찾아 arrayRemove로 뺀다.
 * 댓글은 map 배열이라 색인으로 못 찾는다 — 내 반응이 달린 게시물만이라도 같이 훑어
 * 지우고, 그 밖의 게시물은 아래 scanCommentsOnOthersPosts가 맡는다.
 */
async function removeReactionsOnOthersPosts(uid) {
    let touched = 0;
    for (const type of REACTION_TYPES) {
        for (;;) {
            const snap = await getDb().collection("gallery_posts")
                .where(`reactions.${type}`, "array-contains", uid)
                .limit(QUERY_PAGE_SIZE)
                .get();
            if (snap.empty) break;
            const batch = getDb().batch();
            snap.docs.forEach((docSnap) => {
                batch.update(docSnap.ref, {
                    [`reactions.${type}`]: FieldValue.arrayRemove(uid),
                    reactionPointAwardedUserIds: FieldValue.arrayRemove(uid),
                });
            });
            await batch.commit();
            touched += snap.size;
            if (snap.size < QUERY_PAGE_SIZE) break;
        }
    }
    return touched;
}

/**
 * 댓글은 { userId, userName, text } 맵의 배열이라 Firestore 색인으로 찾을 수 없다.
 * 전수로 훑는 수밖에 없어서 상한을 둔다. 상한에 걸리면 그 사실을 그대로 돌려준다 —
 * 조용히 일부만 지우고 다 지웠다고 보고하면 그게 더 나쁘다.
 */
async function removeCommentsOnOthersPosts(uid, maxScan = 5000) {
    let scanned = 0;
    let updated = 0;
    let truncated = false;
    let cursor = null;

    for (;;) {
        let q = getDb().collection("gallery_posts").orderBy("__name__").limit(QUERY_PAGE_SIZE);
        if (cursor) q = q.startAfter(cursor);
        const snap = await q.get();
        if (snap.empty) break;

        const batch = getDb().batch();
        let inBatch = 0;
        for (const docSnap of snap.docs) {
            const comments = docSnap.get("comments");
            if (!Array.isArray(comments)) continue;
            const kept = comments.filter((c) => String(c?.userId || "") !== uid);
            if (kept.length !== comments.length) {
                batch.update(docSnap.ref, { comments: kept });
                inBatch += 1;
            }
        }
        if (inBatch > 0) {
            await batch.commit();
            updated += inBatch;
        }

        scanned += snap.size;
        cursor = snap.docs[snap.docs.length - 1];
        if (snap.size < QUERY_PAGE_SIZE) break;
        if (scanned >= maxScan) {
            truncated = true;
            break;
        }
    }
    return { scanned, updated, truncated };
}

async function deleteAllUserStorage(uid) {
    const bucket = admin.storage().bucket();
    let removedPrefixes = 0;
    const failed = [];

    for (const prefix of STORAGE_PREFIXES) {
        try {
            // deleteFiles가 페이지를 알아서 넘긴다. 폴더가 없으면 조용히 지나간다.
            await bucket.deleteFiles({ prefix: `${prefix}/${uid}/`, force: true });
            removedPrefixes += 1;
        } catch (error) {
            console.warn("[deleteMyAccount] storage prefix failed:", prefix, error?.message || error);
            failed.push(prefix);
        }
    }
    return { removedPrefixes, failed };
}

/**
 * 지금 바로 모두 지운다. 탈퇴 화면에서 "바로 삭제"를 고른 경우와, 보관 기한이 지난
 * 회원을 매일 정리할 때 같은 절차를 쓴다. 보관 중에 새로 생긴 문서가 있어도 같이 훑는다.
 */
async function deleteAccountNow(uid) {
    const report = {
        uid,
        mode: "now",
        firestore: {},
        storage: null,
        retained: {},
        startedAt: new Date().toISOString(),
    };

    // 1) 파일부터. 계정 문서를 먼저 지우면 중간에 실패했을 때 어떤 사진이
    //    누구 것이었는지 되짚을 방법이 없어진다.
    report.storage = await deleteAllUserStorage(uid);

    // 2) 남의 문서에 남은 내 흔적
    report.firestore.reactionsRemoved = await removeReactionsOnOthersPosts(uid);
    report.firestore.comments = await removeCommentsOnOthersPosts(uid);

    // 3) 내 문서
    for (const [collectionName, field, childDocPaths] of OWNED_QUERIES) {
        const key = `${collectionName}.${field}`;
        try {
            report.firestore[key] = await deleteQueryFully(collectionName, field, uid, childDocPaths);
        } catch (error) {
            console.warn("[deleteMyAccount] delete failed:", key, error?.message || error);
            report.firestore[key] = `FAILED: ${error?.message || error}`;
        }
    }
    try {
        report.firestore.point_ledger = await deletePointLedgers(uid);
    } catch (error) {
        console.warn("[deleteMyAccount] point_ledger failed:", error?.message || error);
        report.firestore.point_ledger = `FAILED: ${error?.message || error}`;
    }
    report.firestore.friendships = await deleteFriendships(uid);

    for (const collectionName of OWNED_DOCS_BY_UID) {
        try {
            await getDb().collection(collectionName).doc(uid).delete();
            report.firestore[collectionName] = 1;
        } catch (error) {
            console.warn("[deleteMyAccount] delete failed:", collectionName, error?.message || error);
            report.firestore[collectionName] = `FAILED: ${error?.message || error}`;
        }
    }

    // 4) 회원 문서와 하위 컬렉션(inbodyHistory, bloodTests, pushTokens)을 통째로.
    //    recursiveDelete가 하위까지 알아서 훑는다.
    try {
        await getDb().recursiveDelete(getDb().collection("users").doc(uid));
        report.firestore.userDocument = "deleted (with subcollections)";
    } catch (error) {
        console.warn("[deleteMyAccount] user doc failed:", error?.message || error);
        report.firestore.userDocument = `FAILED: ${error?.message || error}`;
    }

    // 5) 보관함. 30일 보관을 골랐던 회원이면 회원 문서·갤러리 등이 여기 있다.
    try {
        await getDb().recursiveDelete(getDb().collection(HOLDS).doc(uid));
        report.firestore.hold = "deleted";
    } catch (error) {
        console.warn("[deleteMyAccount] hold failed:", error?.message || error);
        report.firestore.hold = `FAILED: ${error?.message || error}`;
    }

    // 6) 남긴 것을 센다. 몇 건을 왜 남겼는지 이용자에게 말할 수 있어야 한다.
    for (const [collectionName, field] of RETAINED_COLLECTIONS) {
        try {
            const snap = await getDb().collection(collectionName)
                .where(field, "==", uid)
                .count()
                .get();
            report.retained[collectionName] = snap.data().count;
        } catch (error) {
            report.retained[collectionName] = `COUNT FAILED: ${error?.message || error}`;
        }
    }

    // 7) 마지막으로 인증 계정. 이걸 먼저 지우면 위 작업들의 권한 근거가 사라진다.
    try {
        await admin.auth().deleteUser(uid);
        report.authAccount = "deleted";
    } catch (error) {
        console.error("[deleteMyAccount] auth delete failed:", error?.message || error);
        report.authAccount = `FAILED: ${error?.message || error}`;
    }

    report.finishedAt = new Date().toISOString();
    console.log("[deleteMyAccount] done:", JSON.stringify(report));
    return report;
}

const holdDocId = (path) => encodeURIComponent(path);

/** 문서와 그 아래 하위 컬렉션 문서를 모두 모은다. 회원 문서 아래에는 체성분·혈액검사·푸시 토큰이 있다. */
async function collectDocTree(docRef, out) {
    const snap = await docRef.get();
    if (snap.exists) out.push(snap);
    const subcollections = await docRef.listCollections();
    for (const sub of subcollections) {
        const refs = await sub.listDocuments();
        for (const ref of refs) await collectDocTree(ref, out);
    }
}

async function commitInBatches(items, apply) {
    let batch = getDb().batch();
    let inBatch = 0;
    for (const item of items) {
        apply(batch, item);
        inBatch += 1;
        if (inBatch >= BATCH_SIZE) {
            await batch.commit();
            batch = getDb().batch();
            inBatch = 0;
        }
    }
    if (inBatch > 0) await batch.commit();
}

// 클레임 값은 삭제 예정 시각(ms). 다시 로그인한 화면이 "언제 지워지는지"를 서버에 묻지 않고 보여 준다.
async function setPendingClaim(uid, purgeAtMillis) {
    const user = await admin.auth().getUser(uid);
    const claims = { ...(user.customClaims || {}) };
    if (purgeAtMillis) claims[PENDING_CLAIM] = purgeAtMillis;
    else delete claims[PENDING_CLAIM];
    await admin.auth().setCustomUserClaims(uid, claims);
}

/**
 * 30일 보관. 남이 보거나 회원 목록을 훑는 길에 걸리는 문서를 보관함으로 옮긴다.
 * 복사를 모두 마친 뒤에 원본을 지우므로, 중간에 끊겨 다시 불러도 잃는 것이 없다
 * (보관함 문서 id 가 원래 경로라 같은 문서는 같은 자리에 다시 쓴다).
 */
async function holdAccount(uid) {
    const rootRef = getDb().collection(HOLDS).doc(uid);
    const existing = await rootRef.get();
    // 다시 불러도 기한은 처음 신청한 날에서 센다.
    const purgeAt = existing.exists && existing.get("purgeAt")
        ? existing.get("purgeAt")
        : Timestamp.fromMillis(Date.now() + HOLD_DAYS * 24 * 60 * 60 * 1000);

    const snaps = [];
    for (const collectionName of HELD_DOCS_BY_UID) {
        await collectDocTree(getDb().collection(collectionName).doc(uid), snaps);
    }
    for (const [collectionName, field, op] of HELD_QUERIES) {
        const snap = await getDb().collection(collectionName).where(field, op, uid).get();
        for (const docSnap of snap.docs) await collectDocTree(docSnap.ref, snaps);
    }

    await commitInBatches(snaps, (batch, docSnap) => {
        batch.set(rootRef.collection("docs").doc(holdDocId(docSnap.ref.path)), {
            path: docSnap.ref.path,
            data: docSnap.data(),
        });
    });
    await rootRef.set({
        uid,
        requestedAt: existing.exists ? existing.get("requestedAt") : FieldValue.serverTimestamp(),
        purgeAt,
    }, { merge: true });
    await commitInBatches(snaps, (batch, docSnap) => batch.delete(docSnap.ref));

    // 남의 공간에 내 이름이 보이는 것들. 숨길 방법이 지우는 것뿐이라 복구되지 않는다.
    // 반응은 uid 배열이라 숫자만 보여 그대로 둔다.
    const comments = await removeCommentsOnOthersPosts(uid);
    const notificationsSent = await deleteQueryFully("notifications", "fromUserId", uid);

    // 다른 기기에 열려 있던 세션은 다음 토큰 갱신 때 끊긴다. 다시 로그인하면
    // 클라이언트가 이 표시를 보고 화면을 그리기 전에 복구 여부를 묻는다.
    await setPendingClaim(uid, purgeAt.toMillis());
    await admin.auth().revokeRefreshTokens(uid);

    const report = {
        uid,
        mode: "hold",
        heldDocs: snaps.length,
        purgeAt: purgeAt.toDate().toISOString(),
        comments,
        notificationsSent,
    };
    console.log("[deleteMyAccount] held:", JSON.stringify(report));
    return report;
}

/** 보관함에서 원래 자리로. 기한이 지났으면 받지 않는다 — 그때는 이미 지워져야 하는 자료다. */
async function restoreAccount(uid) {
    const rootRef = getDb().collection(HOLDS).doc(uid);
    const root = await rootRef.get();
    if (!root.exists) {
        // 보관함이 없는데 표시만 남은 경우(복구 도중 끊김 등). 표시를 걷어야 로그인이 풀린다.
        await setPendingClaim(uid, null);
        return { uid, restoredDocs: 0, hold: "missing" };
    }
    const purgeAt = root.get("purgeAt");
    if (purgeAt && purgeAt.toMillis() <= Date.now()) {
        throw new HttpsError("failed-precondition", "보관 기간 30일이 지나 복구할 수 없습니다.");
    }

    let restoredDocs = 0;
    let cursor = null;
    for (;;) {
        let q = rootRef.collection("docs").orderBy("__name__").limit(QUERY_PAGE_SIZE);
        if (cursor) q = q.startAfter(cursor);
        const snap = await q.get();
        if (snap.empty) break;
        // 보관 중에 같은 자리에 문서가 새로 생겼어도(다른 기기의 옛 세션) 보관본으로 덮는다.
        await commitInBatches(snap.docs, (batch, held) => {
            batch.set(getDb().doc(held.get("path")), held.get("data") || {});
        });
        restoredDocs += snap.size;
        if (snap.size < QUERY_PAGE_SIZE) break;
        cursor = snap.docs[snap.docs.length - 1];
    }

    await getDb().recursiveDelete(rootRef);
    await setPendingClaim(uid, null);
    const report = { uid, restoredDocs };
    console.log("[restoreMyAccount] done:", JSON.stringify(report));
    return report;
}

exports.deleteMyAccount = onCall(
    // 기록이 많은 계정은 오래 걸린다. 사진 삭제와 전수 훑기가 대부분의 시간을 쓴다.
    { region: "asia-northeast3", memory: "512MiB", timeoutSeconds: 540 },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        // 탈퇴 화면에서 회원이 고른다. 고르는 화면이 없던 옛 앱은 {} 를 보내므로 지금 삭제다.
        if (request.data?.mode === "hold") return holdAccount(uid);
        return deleteAccountNow(uid);
    }
);

exports.restoreMyAccount = onCall(
    { region: "asia-northeast3", memory: "512MiB", timeoutSeconds: 540 },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        return restoreAccount(uid);
    }
);

// 보관 기한이 지난 회원을 매일 지운다. 사람이 기억해서 지우는 방식이면 언젠가 빠진다.
exports.purgeHeldAccounts = onSchedule(
    {
        region: "asia-northeast3",
        schedule: "0 4 * * *",
        timeZone: "Asia/Seoul",
        timeoutSeconds: 540,
        memory: "512MiB",
    },
    async () => {
        const PER_RUN = 10;
        const due = await getDb().collection(HOLDS)
            .where("purgeAt", "<=", Timestamp.now())
            .limit(PER_RUN)
            .get();
        for (const docSnap of due.docs) {
            try {
                await deleteAccountNow(docSnap.id);
            } catch (error) {
                console.error("[purgeHeldAccounts] failed:", docSnap.id, error?.message || error);
            }
        }
        // 하루 몫을 넘기면 다음 날로 밀린다. 밀렸다는 사실은 남긴다.
        console.log(`[purgeHeldAccounts] purged ${due.size}${due.size === PER_RUN ? " (more may remain)" : ""}`);
    }
);
