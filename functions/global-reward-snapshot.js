"use strict";

/**
 * 자산 탭 「해빛 배지」를 펼칠 때 부르는 함수(배지 목록·보유·포인트).
 *
 * 2026-11-24 대표: 「펼치기를 누르고 4초쯤 뒤에 나와 고장 난 줄 알았다」. 운영 로그(30일, 85번)로 보니
 * 깨어 있으면 0.1초인데 잠들어 있으면 1~3.3초였다 — 펼치는 사람이 적어 자주 잠들고, 깨어날 때
 * runtime.js(1만 4천 줄)를 통째로 읽었다. 그래서 이 파일만 읽고 시작하게 했다(functions/index.js 의
 * FAST_START_MODULES). 계산은 그대로 functions/global-rewards.js 의 buildGlobalRewardSnapshot 이다.
 */

const { onCall: baseOnCall, HttpsError } = require("firebase-functions/v2/https");
const { localizedOnCall } = require("./error-messages");
const onCall = localizedOnCall(baseOnCall);
const admin = require("firebase-admin");
const { buildGlobalRewardSnapshot } = require("./global-rewards");

function getDb() {
    if (!admin.apps.some((app) => app?.name === "[DEFAULT]")) admin.initializeApp();
    return admin.firestore();
}

exports.getGlobalRewardSnapshot = onCall(
    { region: "asia-northeast3" },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        const db = getDb();
        const userSnap = await db.collection("users").doc(uid).get();
        if (!userSnap.exists) throw new HttpsError("not-found", "사용자 정보를 찾을 수 없습니다.");
        return buildGlobalRewardSnapshot({ db, uid, userData: userSnap.data() || {} });
    }
);
