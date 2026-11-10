/**
 * 앱 지갑 암호화 키의 서버 비밀 조각(pepper)을 내려주는 함수.
 *
 * 왜 필요한가.
 * v2 지갑은 개인키를 AES로 암호화해 users/{uid}에 넣으면서, 그 암호를 만드는 재료로
 * uid(문서 id)와 email(같은 문서의 필드)을 썼다. 둘 다 암호문 바로 옆에 있으므로
 * 그 문서를 읽을 수 있는 쪽은 키를 다시 계산해 지갑을 열 수 있었다. 암호화가
 * Firestore 접근 통제 이상의 보호를 주지 못했다(2026-11-10 외부 제보로 확인).
 *
 * v3는 Secret Manager에 있는 비밀로 사용자별 pepper를 만들어 내려준다. pepper는
 * 어디에도 저장하지 않는다. Firestore를 통째로 유출해도 이 비밀이 없으면 열지 못한다.
 *
 * 비밀을 잃어버리면 v3로 옮긴 지갑은 복구할 수 없다. 값을 안전한 곳에 따로 보관해야 한다.
 *
 *   firebase functions:secrets:set WALLET_KEY_PEPPER
 */

const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

const WALLET_KEY_PEPPER = defineSecret("WALLET_KEY_PEPPER");

// 버전을 재료에 넣는다. 나중에 파생 방식을 바꾸면 이 문자열만 올린다.
const PEPPER_CONTEXT = "habitschool-wallet-key:v3";

function derivePepper(secret, uid) {
    return crypto.createHmac("sha256", secret).update(`${PEPPER_CONTEXT}:${uid}`).digest("hex");
}

exports.getWalletKeyPepper = onCall(
    {
        region: "asia-northeast3",
        maxInstances: 20,
        secrets: [WALLET_KEY_PEPPER],
        invoker: "public"  // Firebase Auth는 아래에서 직접 검증한다
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        // **자기 것만 내려준다.** 관리자라도 남의 pepper는 받을 수 없다.
        // 받는 순간 그 사람 지갑을 열 수 있기 때문이다.
        const uid = request.auth.uid;

        const secret = WALLET_KEY_PEPPER.value();
        if (!secret || secret.length < 32) {
            console.error("WALLET_KEY_PEPPER 비밀이 없거나 너무 짧습니다.");
            throw new HttpsError("failed-precondition", "지갑 키 설정이 준비되지 않았습니다.");
        }

        return { pepper: derivePepper(secret, uid), walletVersion: 3 };
    }
);

exports._test = { derivePepper, PEPPER_CONTEXT };
