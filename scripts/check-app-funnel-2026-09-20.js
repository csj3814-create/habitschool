// 앱으로 옮겨 가는 길의 세 단계를 한 번에 본다. 읽기만 한다.
//
//   node scripts/check-app-funnel-2026-09-20.js C:/SJ/antigravity/habitchatbot/appServiceAccountKey.json
//
// 2026-09-19 에 세 가지가 함께 나갔다.
//   settings.lastWebPlatform      — 웹으로 연 기기(android/ios/desktop)
//   settings.lastAppInviteTapDate — 앱 권유 배너를 누른 날
//   settings.lastAppOpenDate      — 앱으로 연 날
//
// 2026-09-22 정정: **이 스크립트의 숫자는 Play 의 기준이 아니다.**
//
// Play Console 은 "비공개 테스트 참여를 선택(옵트인)한 테스터" 를 센다. 옵트인은
// 참여 링크에서 버튼 한 번이고, 설치하지 않아도, 앱을 열지 않아도 된다.
// 여기서 세는 lastAppOpenDate 는 **앱을 연 사람**이라 그보다 늘 적다.
//
// 그 차이를 모르고 "9명 / 12명, 3명 부족" 이라고 여러 날 보고했는데, 같은 날
// Play Console 은 12명 조건을 이미 통과로 표시하고 있었다. 숫자가 틀린 것이
// 아니라 **다른 것을 세고 있었다.** 재신청 판단은 반드시 Play Console 로 한다.
//
// 이 숫자가 쓸모없는 것은 아니다. 옵트인만 하고 실제로 쓰지는 않는 사람과
// 진짜로 앱을 쓰는 사람을 가르는 **하한선**이다. 그 용도로만 읽는다.

// 이 셋이 있어야 "안 오른다" 를 셋으로 가를 수 있다.
//   안드로이드 웹인데 안 누름 → 문구가 약하다
//   눌렀는데 앱 실행이 없음   → 설치 단계에서 막힌다
//   아이폰이 대부분           → 12명은 애초에 닿을 수 없는 숫자다
//
// 출력에는 집계만 담는다. uid·이름·이메일은 적지 않는다.

const path = require("path");
let admin;
try {
    admin = require("firebase-admin");
} catch (_) {
    admin = require(path.join(__dirname, "..", "functions", "node_modules", "firebase-admin"));
}

const keyPath = process.argv[2];
if (!keyPath) {
    console.error("사용법: node scripts/check-app-funnel-2026-09-20.js <서비스계정키>");
    process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(keyPath))) });
const db = admin.firestore();

const MIN_TESTERS = 12;
const WINDOW_DAYS = 14;
const REAPPLY_DATE = "2026-09-30";

const kstToday = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const shift = (d, n) => {
    const x = new Date(`${d}T00:00:00Z`);
    x.setUTCDate(x.getUTCDate() - n);
    return x.toISOString().slice(0, 10);
};

async function main() {
    const today = kstToday();
    const since14 = shift(today, WINDOW_DAYS);
    const since30 = shift(today, 30);

    const [usersSnap, logsSnap] = await Promise.all([
        db.collection("users").select("settings").get(),
        db.collection("daily_logs").where("date", ">=", since30).select("userId", "date").get(),
    ]);

    const active = new Set();
    logsSnap.forEach((d) => {
        const row = d.data() || {};
        if (row.userId) active.add(row.userId);
    });

    const platform = new Map();
    let appOpenEver = 0;
    let appOpenInWindow = 0;
    let tapped = 0;
    let tappedThenOpened = 0;
    let androidWeb = 0;
    let androidWebActive = 0;
    const openDates = new Map();
    const tapDates = new Map();

    usersSnap.forEach((docSnap) => {
        const s = (docSnap.data() || {}).settings || {};
        const isActive = active.has(docSnap.id);

        const web = String(s.lastWebPlatform || "");
        if (web) {
            platform.set(web, (platform.get(web) || 0) + 1);
            if (web === "android") {
                androidWeb += 1;
                if (isActive) androidWebActive += 1;
            }
        }

        const opened = String(s.lastAppOpenDate || "");
        if (opened) {
            appOpenEver += 1;
            openDates.set(opened, (openDates.get(opened) || 0) + 1);
            if (opened >= since14) appOpenInWindow += 1;
        }

        const tap = String(s.lastAppInviteTapDate || "");
        if (tap) {
            tapped += 1;
            tapDates.set(tap, (tapDates.get(tap) || 0) + 1);
            if (opened) tappedThenOpened += 1;
        }
    });

    console.log("오늘(KST):", today);
    console.log("");
    console.log("━━ 1. 앱 실행 (Play 기준) ━━");
    console.log("  최근 14일 안에 앱을 연 회원:", appOpenInWindow, "명");
    console.log("  ※ Play 가 세는 것은 참여 선택(옵트인)이라 이 숫자보다 많다.");
    console.log("     재신청 가능 여부는 Play Console 대시보드로만 판단한다.");
    console.log("  한 번이라도 연 회원:", appOpenEver, "명");
    console.log("  날짜별(최근순):");
    [...openDates.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 8)
        .forEach(([d, n]) => console.log(`    ${d}: ${n}명`));

    console.log("");
    console.log("━━ 2. 웹으로 여는 기기 ━━");
    if (platform.size === 0) {
        console.log("  아직 기록 없음 — 어제 배포됐으니 하루 이틀 더 필요하다");
    } else {
        [...platform.entries()].sort((a, b) => b[1] - a[1])
            .forEach(([k, n]) => console.log(`  ${k}: ${n}명`));
        console.log("  그중 안드로이드 · 최근 30일 활동:", androidWebActive, "명  ← 배너가 보이는 사람");
    }

    console.log("");
    console.log("━━ 3. 배너 ━━");
    console.log("  누른 사람:", tapped, "명");
    console.log("  누르고 앱까지 연 사람:", tappedThenOpened, "명");
    if (tapDates.size) {
        [...tapDates.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
            .forEach(([d, n]) => console.log(`    ${d}: ${n}명`));
    }

    const daysLeft = Math.round(
        (new Date(`${REAPPLY_DATE}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000
    );
    console.log("");
    console.log("━━ 판단 ━━");
    console.log(`  재신청 가능일 ${REAPPLY_DATE} · ${daysLeft}일 남음`);
    console.log(`  기준(${MIN_TESTERS}명) 충족 여부는 여기서 말하지 않는다 — Play Console 을 본다.`);
    console.log("  Play 대시보드 > 프로덕션 > 프로덕션 액세스 신청 의 체크리스트가 정답이다.");
    console.log("");
    console.log("  여기서 읽을 것은 하나다: 옵트인한 사람들이 실제로 앱을 쓰고 있는가.");
    console.log(`    앱을 연 회원 ${appOpenInWindow}명 · 배너를 누른 회원 ${tapped}명`);
    if (androidWebActive > 0) {
        console.log(`    아직 웹으로만 쓰는 안드로이드 활동 회원 ${androidWebActive}명 — 여유분을 만들 자리`);
    }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
