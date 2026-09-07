// 브라우저별 로그인 결과를 GA4 에서 뽑는다. 읽기만 한다.
//
//   node scripts/fetch-ga4-auth-by-browser-2026-09-07.js <serviceAccountKey.json> <GA4속성ID> [시작일] [종료일]
//   예) node scripts/fetch-ga4-auth-by-browser-2026-09-07.js ../habitchatbot/appServiceAccountKey.json 123456789 2026-07-01 today
//
// 왜 필요한가
//   2026-09-07 에 삼성 인터넷 일반 탭의 구글 로그인이 Gmail 로 새는 것을 확인하고
//   고쳤다. 그런데 로그인을 못 끝낸 사람은 users 문서가 아예 안 생겨서 회원 608명
//   기준 퍼널 어디에도 안 잡힌다. 분모 밖의 손실이라, 브라우저 차원으로 쪼갠 GA
//   이벤트가 유일한 관측 수단이다.
//
// 두 가지를 같이 본다
//   1. 브라우저 × auth_result.status — 삼성 인터넷만 성공률이 낮은가
//   2. 삼성 인터넷 날짜별 — 2026-08-12(설치앱 authDomain 수정)와 2026-09-07
//      (일반 탭 수정) 전후로 꺾이는가. Play 비공개 테스트 초대가 7/24·8/5 에
//      나갔으므로 재신청 판단에도 쓰인다.
//
// 사전 준비 (콘솔 작업 2개, 한 번만)
//   1. Google Analytics Data API 사용 설정
//      https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com
//   2. GA4 관리 > 속성 액세스 관리 에서 서비스 계정 이메일을 '뷰어' 로 추가
//      (키 파일의 client_email. 실행하면 이 스크립트가 그 주소를 알려준다)
//   속성 ID 는 GA4 관리 > 속성 세부정보 의 숫자다. G- 로 시작하는 측정 ID 가 아니다.

const fs = require("fs");
const path = require("path");

function loadDep(name) {
    try {
        return require(name);
    } catch (_) {
        try {
            return require(path.join(__dirname, "..", "functions", "node_modules", name));
        } catch (_) {
            return null;
        }
    }
}

const args = process.argv.slice(2).filter(a => !a.startsWith("--"));
const keyPath = args[0];
const propertyId = args[1];
const startDate = args[2] || "2026-07-01";
const endDate = args[3] || "today";

if (!keyPath || !propertyId) {
    console.error("사용법: node scripts/fetch-ga4-auth-by-browser-2026-09-07.js <serviceAccountKey.json> <GA4속성ID> [시작일] [종료일]");
    process.exit(1);
}

const absKey = path.resolve(keyPath);
if (!fs.existsSync(absKey)) {
    console.error("서비스 계정 키를 찾을 수 없다: " + absKey);
    process.exit(1);
}
const sa = require(absKey);

const analyticsData = loadDep("@google-analytics/data");
if (!analyticsData) {
    console.error("@google-analytics/data 가 없다. 먼저 설치할 것:\n");
    console.error("  npm install --no-save @google-analytics/data\n");
    console.error("설치 후 다시 실행하면 된다.");
    process.exit(1);
}

const client = new analyticsData.BetaAnalyticsDataClient({
    credentials: { client_email: sa.client_email, private_key: sa.private_key },
    projectId: sa.project_id
});

const pct = (n, d) => (d > 0 ? ((n / d) * 100).toFixed(1) + "%" : "—");

async function runReport(body) {
    const res = await client.runReport(Object.assign({ property: "properties/" + propertyId }, body));
    return res[0];
}

// [dim0][dim1] -> metric 합계
function rowsToMatrix(res) {
    const out = new Map();
    (res.rows || []).forEach(r => {
        const a = (r.dimensionValues[0] && r.dimensionValues[0].value) || "(없음)";
        const b = (r.dimensionValues[1] && r.dimensionValues[1].value) || "(없음)";
        const v = Number((r.metricValues[0] && r.metricValues[0].value) || 0);
        if (!out.has(a)) out.set(a, new Map());
        out.get(a).set(b, (out.get(a).get(b) || 0) + v);
    });
    return out;
}

// GA4 는 이벤트 파라미터를 '맞춤 측정기준' 으로 등록해야 조회할 수 있다.
// 등록 전에는 수집만 되고 Data API 에서도 보고서에서도 못 꺼낸다.
// 있으면 status 로 쪼개고, 없으면 건수만으로 답을 낸다.
async function detectStatusDimension() {
    try {
        const res = await client.getMetadata({ name: "properties/" + propertyId + "/metadata" });
        const dims = (res[0] && res[0].dimensions) || [];
        return dims.some(d => d.apiName === "customEvent:status");
    } catch (_) {
        return false;
    }
}

let HAS_STATUS = false;

async function main() {
    console.log("자격증명: " + sa.client_email);
    console.log("속성: properties/" + propertyId + "   기간: " + startDate + " ~ " + endDate);

    HAS_STATUS = await detectStatusDimension();
    console.log("status 맞춤 측정기준: " + (HAS_STATUS ? "있음" : "없음 — 건수만으로 본다") + "\n");

    const dateRanges = [{ startDate: startDate, endDate: endDate }];

    const byBrowser = rowsToMatrix(await runReport({
        dateRanges: dateRanges,
        dimensions: [{ name: "browser" }].concat(HAS_STATUS
            ? [{ name: "customEvent:status" }]
            : [{ name: "eventName" }]),
        metrics: [{ name: "eventCount" }],
        dimensionFilter: {
            filter: { fieldName: "eventName", stringFilter: { value: "auth_result" } }
        },
        limit: 500
    }));

    const sessionsRes = await runReport({
        dateRanges: dateRanges,
        dimensions: [{ name: "browser" }],
        metrics: [{ name: "sessions" }],
        limit: 200
    });
    const sessions = new Map();
    (sessionsRes.rows || []).forEach(r => {
        sessions.set((r.dimensionValues[0] && r.dimensionValues[0].value) || "(없음)",
            Number((r.metricValues[0] && r.metricValues[0].value) || 0));
    });

    const L = [];
    const w = (s) => L.push(s === undefined ? "" : s);

    w("# 브라우저별 로그인 결과 (GA4, " + startDate + " ~ " + endDate + ")");
    w();
    w("`scripts/fetch-ga4-auth-by-browser-2026-09-07.js` 출력. 읽기 전용.");
    w();
    if (!HAS_STATUS) {
        w("> **`status` 가 GA4 맞춤 측정기준으로 등록돼 있지 않다.** 앱은 `auth_result` 에");
        w("> `status` 를 실어 보내고 있지만, GA4 는 등록된 파라미터만 조회를 허용한다.");
        w("> 그래서 성공/실패를 못 가르고 **건수**로만 본다. 관리 > 데이터 표시 >");
        w("> 맞춤 정의 에서 등록하면 다음부터 갈린다 (등록 이후 데이터부터 적용된다).");
        w();
    }
    w("## 1. 브라우저 × `auth_result`");
    w();

    const statuses = new Set();
    byBrowser.forEach(m => m.forEach((_, k) => statuses.add(k)));
    const statusCols = Array.from(statuses).sort();

    w("| 브라우저 | 세션 | " + statusCols.join(" | ") + " | 합계 | 성공률 |");
    w("|---|---:|" + statusCols.map(() => "---:").join("|") + "|---:|---:|");

    const browsers = Array.from(new Set(Array.from(byBrowser.keys()).concat(Array.from(sessions.keys()))))
        .sort((a, b) => (sessions.get(b) || 0) - (sessions.get(a) || 0));

    browsers.forEach(b => {
        const m = byBrowser.get(b) || new Map();
        const total = Array.from(m.values()).reduce((s, v) => s + v, 0);
        const ok = m.get("success") || 0;
        const cells = statusCols.map(c => String(m.get(c) || 0));
        w("| " + b + " | " + (sessions.get(b) || 0) + " | " + cells.join(" | ")
            + " | " + total + " | " + pct(ok, total) + " |");
    });
    w();
    w("> 세션은 많은데 `auth_result` 자체가 거의 없는 브라우저가 있으면, 그건 실패가");
    w("> 아니라 **로그인 화면을 벗어나지 못한 것**이다. 이번 건이 그 모양이다 —");
    w("> 구글 계정 화면이 Gmail 앱으로 넘어가면 앱으로 돌아오지 않으므로 결과 이벤트가 없다.");
    w();

    const samsungDaily = rowsToMatrix(await runReport({
        dateRanges: dateRanges,
        dimensions: [{ name: "date" }].concat(HAS_STATUS
            ? [{ name: "customEvent:status" }]
            : [{ name: "eventName" }]),
        metrics: [{ name: "eventCount" }],
        dimensionFilter: {
            andGroup: {
                expressions: [
                    { filter: { fieldName: "eventName", stringFilter: { value: "auth_result" } } },
                    { filter: { fieldName: "browser", stringFilter: { value: "Samsung Internet" } } }
                ]
            }
        },
        limit: 1000,
        orderBys: [{ dimension: { dimensionName: "date" } }]
    }));

    w("## 2. 삼성 인터넷 — 날짜별 `auth_result`");
    w();
    w("두 수정의 경계를 같이 본다: **2026-08-12** 설치앱 authDomain, **2026-09-07** 일반 탭 redirect.");
    w("Play 비공개 테스트 초대는 **7/24 · 8/5** 에 나갔다.");
    w();
    if (samsungDaily.size === 0) {
        w("해당 기간에 삼성 인터넷 `auth_result` 가 없다.");
        w();
        w("> **없다는 것 자체가 신호다.** 위 표에서 삼성 인터넷 세션이 있는데 이벤트가");
        w("> 0이면, 로그인 시도가 결과에 닿지 못했다는 뜻이다.");
    } else {
        w("| 날짜 | " + statusCols.join(" | ") + " | 합계 |");
        w("|---|" + statusCols.map(() => "---:").join("|") + "|---:|");
        Array.from(samsungDaily.keys()).sort().forEach(d => {
            const m = samsungDaily.get(d);
            const total = Array.from(m.values()).reduce((s, v) => s + v, 0);
            const pretty = /^\d{8}$/.test(d) ? d.slice(0, 4) + "-" + d.slice(4, 6) + "-" + d.slice(6) : d;
            w("| " + pretty + " | " + statusCols.map(c => String(m.get(c) || 0)).join(" | ") + " | " + total + " |");
        });
    }
    w();

    const out = L.join("\n") + "\n";
    const outPath = path.join(__dirname, "..", "tasks", "2026-09-07_ga4_auth_by_browser.md");
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, out, "utf8");
    console.log(out);
    console.log("→ " + outPath);
}

main().catch(err => {
    const msg = String((err && err.message) || err);
    if (/PERMISSION_DENIED|403/.test(msg)) {
        console.error("\nGA4 속성에 이 서비스 계정이 없다. 콘솔에서 '뷰어' 로 추가할 것:\n");
        console.error("  " + sa.client_email + "\n");
        console.error("GA4 관리 > 속성 액세스 관리 > + > 사용자 추가\n");
    } else if (/has not been used|SERVICE_DISABLED/.test(msg)) {
        console.error("\nGoogle Analytics Data API 가 꺼져 있다. 사용 설정할 것:\n");
        console.error("  https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com?project=" + sa.project_id + "\n");
    } else if (/INVALID_ARGUMENT/.test(msg) && /propert/i.test(msg)) {
        console.error("\n속성 ID 를 확인할 것. GA4 관리 > 속성 세부정보 의 숫자다 (G- 측정 ID 가 아니다).\n");
    }
    console.error(msg);
    process.exit(1);
});
