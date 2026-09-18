// 동의 창이 왜 다시 뜨는지 본다. 읽기만 한다.
//
//   node scripts/check-consent-records-2026-09-18.js C:/SJ/antigravity/habitchatbot/appServiceAccountKey.json
//
// 2026-09-18 제보: "동의 화면이 왜 계속 뜨지? 업데이트마다 다시 받나?"
//
// 화면에 뜬 것은 '가입 전 확인 / 시작하기 전에 동의가 필요해요' 였다. 이 머리글은
// js/auth.js openReconsentModal 이 firstTime 일 때만 보여 준다. firstTime 은
// hasNoConsentRecord — 즉 읽어 온 회원 문서에 consents 가 **통째로 없을 때**다.
// 약관 개정 때 뜨는 창이 아니다.
//
// 그러면 둘 중 하나다.
//   (가) Firestore 에 정말 consents 가 없다 → 쓰기가 안 되고 있다
//        (2026-08-15 규칙 누락 사고와 같은 종류)
//   (나) 있는데 그 순간 읽어 온 문서에 없었다 → 읽는 쪽 문제
//
// 서버에서 직접 읽으면 (가)인지 (나)인지 한 번에 갈린다.
//
// 출력에는 집계와 제보자 본인 계정 하나만 담는다. 다른 사람의 uid·이름·이메일은
// 적지 않는다.

const path = require("path");
let admin;
try {
    admin = require("firebase-admin");
} catch (_) {
    admin = require(path.join(__dirname, "..", "functions", "node_modules", "firebase-admin"));
}

const keyPath = process.argv[2];
if (!keyPath) {
    console.error("사용법: node scripts/check-consent-records-2026-09-18.js C:/SJ/antigravity/habitchatbot/appServiceAccountKey.json");
    process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(keyPath))) });
const db = admin.firestore();

// 제보자 본인 계정(버그 리포트에 실려 온 uid).
const REPORTER_UID = "KwrwGEa2qoOljcAQkrpuk9MRS6G3";
// js/auth.js 와 같은 값이어야 한다.
const CONSENT_DOC_VERSION = "2026-08-15";
const REQUIRED_KEYS = ["terms", "privacy", "age14"];

const hasNoConsentRecord = (data) => {
    const consents = data && data.consents;
    return !consents || typeof consents !== "object" || Object.keys(consents).length === 0;
};

const needsRefresh = (data) => {
    const consents = (data && data.consents) || null;
    if (!consents || typeof consents !== "object") return true;
    return REQUIRED_KEYS.some((key) => {
        const entry = consents[key];
        return !entry || entry.agreed !== true || entry.version !== CONSENT_DOC_VERSION;
    });
};

async function main() {
    console.log("=== 제보자 본인 계정 ===");
    const mine = await db.doc(`users/${REPORTER_UID}`).get();
    if (!mine.exists) {
        console.log("회원 문서 자체가 없음 (!)");
    } else {
        const data = mine.data() || {};
        console.log("consents 있음:", !hasNoConsentRecord(data));
        console.log("다시 물어볼 상태인가:", needsRefresh(data));
        if (data.consents) {
            for (const key of Object.keys(data.consents)) {
                const entry = data.consents[key] || {};
                const at = entry.at && entry.at.toDate ? entry.at.toDate().toISOString() : String(entry.at || "");
                console.log(`  ${key}: agreed=${entry.agreed} version=${entry.version || "(없음)"} at=${at}`);
            }
        }
        console.log("문서 갱신 시각:", mine.updateTime ? mine.updateTime.toDate().toISOString() : "(모름)");
    }

    console.log("");
    console.log("=== 전체 회원 (집계만) ===");
    const snap = await db.collection("users").select("consents").get();
    let none = 0;
    let stale = 0;
    let ok = 0;
    const versions = new Map();
    snap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        if (hasNoConsentRecord(data)) { none += 1; return; }
        if (needsRefresh(data)) stale += 1; else ok += 1;
        for (const key of REQUIRED_KEYS) {
            const version = ((data.consents || {})[key] || {}).version || "(없음)";
            const mapKey = `${key} · ${version}`;
            versions.set(mapKey, (versions.get(mapKey) || 0) + 1);
        }
    });
    console.log("회원 수:", snap.size);
    console.log("consents 아예 없음 (가입 창이 뜨는 사람):", none);
    console.log("있지만 버전이 어긋남 (개정 창이 뜨는 사람):", stale);
    console.log("최신 동의:", ok);
    console.log("");
    console.log("항목별 버전 분포:");
    [...versions.entries()].sort((a, b) => b[1] - a[1]).forEach(([key, count]) => {
        console.log(`  ${key}: ${count}명`);
    });
}

main().then(() => process.exit(0)).catch((error) => {
    console.error("실패:", error);
    process.exit(1);
});
