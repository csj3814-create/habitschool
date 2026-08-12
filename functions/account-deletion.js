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

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

// admin.initializeApp()은 runtime.js가 부른다. 이 파일이 먼저 로드돼도 터지지 않도록
// 실제로 쓸 때 가져온다.
const getDb = () => admin.firestore();
const { FieldValue } = admin.firestore;

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
    "share_cards",
    "reward_coupons",
]);

// (컬렉션, 사용자 필드) 쌍. 한 컬렉션이 여러 필드로 사람을 가리키면 여러 번 돈다.
const OWNED_QUERIES = Object.freeze([
    ["daily_logs", "userId"],
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
async function deleteQueryFully(collectionName, field, value) {
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

exports.deleteMyAccount = onCall(
    // 기록이 많은 계정은 오래 걸린다. 사진 삭제와 전수 훑기가 대부분의 시간을 쓴다.
    { region: "asia-northeast3", memory: "512MiB", timeoutSeconds: 540 },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");

        const report = {
            uid,
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
        for (const [collectionName, field] of OWNED_QUERIES) {
            const key = `${collectionName}.${field}`;
            try {
                report.firestore[key] = await deleteQueryFully(collectionName, field, uid);
            } catch (error) {
                console.warn("[deleteMyAccount] delete failed:", key, error?.message || error);
                report.firestore[key] = `FAILED: ${error?.message || error}`;
            }
        }
        report.firestore.friendships = await deleteFriendships(uid);

        try {
            await getDb().collection("emailLogs").doc(uid).delete();
            report.firestore.emailLogs = 1;
        } catch (error) {
            report.firestore.emailLogs = `FAILED: ${error?.message || error}`;
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

        // 5) 남긴 것을 센다. 몇 건을 왜 남겼는지 이용자에게 말할 수 있어야 한다.
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

        // 6) 마지막으로 인증 계정. 이걸 먼저 지우면 위 작업들의 권한 근거가 사라진다.
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
);
