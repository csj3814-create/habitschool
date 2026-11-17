/**
 * 회원에게 나가는 안내 메일의 공통 관문.
 *
 * 왜 필요한가 (2026-11-17).
 * 해빛스쿨은 csj38141 Gmail 계정으로 하루 최대 200통 가까운 안내 메일을 보낸다
 * (첫 기록 유도, 복귀 안내, 연속 끊김 알림, 휴면 편지). 그런데
 *   1. 수신 거부 길이 없었다. 그만 받고 싶은 분은 "스팸 신고"를 누를 수밖에 없고,
 *      신고가 쌓이면 Gmail 이 이 계정의 발송을 막는다. 그러면 운영 메일까지 같이 막힌다.
 *   2. 메일 종류마다 쿨다운을 따로 셌다. 같은 주에 복귀 안내, 끊김 알림, 캠페인을
 *      다 받는 분이 생길 수 있었다.
 *
 * 그래서 회원에게 가는 메일은 전부 여기를 거친다.
 *   - 수신 거부한 분께는 보내지 않는다.
 *   - 종류와 상관없이 한 분께 AUTOMATED_EMAIL_MIN_GAP_DAYS 일에 한 통까지만.
 *   - 본문 끝에 수신 거부 링크, 머리글에 List-Unsubscribe(원클릭)를 붙인다.
 *     머리글이 있으면 Gmail 이 메일 위쪽에 "구독 취소" 버튼을 띄운다.
 *
 * 관리자에게 가는 메일(버그 신고 알림)은 여기를 거치지 않는다.
 */

const crypto = require("crypto");

// 마지막 안내 메일 날짜(KST)와 오늘의 차이가 이보다 작으면 보내지 않는다.
// 3 이면 월요일에 받은 분은 목요일부터 다시 받을 수 있다.
const AUTOMATED_EMAIL_MIN_GAP_DAYS = 3;

const UNSUBSCRIBE_PATH = "/unsubscribe";

function toKstDate(value) {
    let ms = NaN;
    if (!value) return "";
    if (typeof value === "string") ms = Date.parse(value);
    else if (typeof value?.toMillis === "function") ms = value.toMillis();
    else if (value instanceof Date) ms = value.getTime();
    if (!Number.isFinite(ms)) return "";
    return new Date(ms + 9 * 3600000).toISOString().slice(0, 10);
}

function daysBetween(fromDate, toDate) {
    const from = Date.parse(`${fromDate}T12:00:00Z`);
    const to = Date.parse(`${toDate}T12:00:00Z`);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return Infinity;
    return Math.round((to - from) / 86400000);
}

/**
 * 이 분이 마지막으로 안내 메일을 받은 날(KST). 없으면 "".
 *
 * 새 필드(lastAutomatedEmailAt)만 보면 배포 첫날에는 모두 비어 있어서 상한이
 * 하루 동안 아무 일도 하지 않는다. 그래서 예전부터 있던 기록도 함께 본다.
 */
function lastAutomatedEmailDate(log = {}) {
    const candidates = [
        log.lastAutomatedEmailAt,
        log.lastSentAt,
        log.streakAlertSentAt,
        log.firstRecordNudge?.sentAt,
        Array.isArray(log.reEngagementHistory) ? log.reEngagementHistory[0]?.sentAt : "",
    ].map(toKstDate).filter(Boolean);
    return candidates.sort().pop() || "";
}

/** 보내도 되는지. 안 되면 이유를 함께 돌려준다. */
function checkAutomatedEmailAllowed(log = {}, todayKst) {
    if (log.emailOptOut === true) return { allowed: false, reason: "optedOut" };
    const last = lastAutomatedEmailDate(log);
    if (last && daysBetween(last, todayKst) < AUTOMATED_EMAIL_MIN_GAP_DAYS) {
        return { allowed: false, reason: "recentlyEmailed", lastDate: last };
    }
    return { allowed: true };
}

function createUnsubscribeToken() {
    return crypto.randomBytes(18).toString("base64url");
}

function tokensMatch(expected, given) {
    const a = Buffer.from(String(expected || ""));
    const b = Buffer.from(String(given || ""));
    if (a.length === 0 || a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

function buildUnsubscribeUrl(appBaseUrl, uid, token) {
    const params = new URLSearchParams({ u: uid, t: token });
    return `${appBaseUrl}${UNSUBSCRIBE_PATH}?${params.toString()}`;
}

function escapeAttr(value) {
    return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** 본문 끝에 붙는 수신 거부 문단과, 메일 머리글. */
function decorateMail({ html, unsubscribeUrl, locale }) {
    const isEnglish = locale === "en";
    const href = escapeAttr(unsubscribeUrl);
    const footer = isEnglish
        ? `<p style="font-size:12px;color:#999;line-height:1.6;text-align:center;margin:24px auto 0;max-width:480px;">`
            + `You got this because you signed up for Habit School. `
            + `<a href="${href}" style="color:#999;">Unsubscribe</a></p>`
        : `<p style="font-size:12px;color:#999;line-height:1.6;text-align:center;margin:24px auto 0;max-width:480px;">`
            + `해빛스쿨에 가입하셔서 보내 드리는 안내입니다. `
            + `더 받지 않으시려면 <a href="${href}" style="color:#999;">수신 거부</a></p>`;
    return {
        html: `${html}\n${footer}`,
        headers: {
            "List-Unsubscribe": `<${unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
    };
}

/**
 * 관문을 통과하면 보내고, 보낸 사실을 emailLogs 에 남긴다.
 *
 * 돌려주는 값: { sent: true } 또는 { sent: false, reason }.
 * 보내지 않았으면 부른 쪽은 자기 발송 기록을 남기지 말아야 한다.
 * 발송 자체가 실패하면 예외가 그대로 올라간다(부른 쪽이 이미 실패를 세고 있다).
 */
async function sendGuardedMemberEmail({
    db,
    transporter,
    uid,
    locale,
    kind,
    appBaseUrl,
    todayKst = toKstDate(new Date()),
    mail,
    now = () => new Date().toISOString(),
}) {
    if (!uid) throw new Error("sendGuardedMemberEmail: uid 가 필요합니다.");
    const logRef = db.collection("emailLogs").doc(uid);
    const snap = await logRef.get();
    const log = snap.exists ? (snap.data() || {}) : {};

    const check = checkAutomatedEmailAllowed(log, todayKst);
    if (!check.allowed) return { sent: false, reason: check.reason };

    const token = log.unsubscribeToken || createUnsubscribeToken();
    const decorated = decorateMail({
        html: mail.html,
        unsubscribeUrl: buildUnsubscribeUrl(appBaseUrl, uid, token),
        locale,
    });

    await transporter.sendMail({
        ...mail,
        html: decorated.html,
        headers: { ...(mail.headers || {}), ...decorated.headers },
    });

    await logRef.set({
        unsubscribeToken: token,
        lastAutomatedEmailAt: now(),
        lastAutomatedEmailKind: kind,
    }, { merge: true });

    return { sent: true };
}

/** 수신 거부 처리. 토큰이 맞을 때만 기록한다. */
async function applyUnsubscribe({ db, uid, token, source, now = () => new Date().toISOString() }) {
    if (!uid || !token || uid.includes("/")) return { ok: false };
    const logRef = db.collection("emailLogs").doc(uid);
    const snap = await logRef.get();
    if (!snap.exists) return { ok: false };
    const log = snap.data() || {};
    if (!tokensMatch(log.unsubscribeToken, token)) return { ok: false };
    if (log.emailOptOut === true) return { ok: true, already: true };
    await logRef.set({
        emailOptOut: true,
        emailOptOutAt: now(),
        emailOptOutSource: source,
    }, { merge: true });
    return { ok: true };
}

const PAGE_STYLE = "font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;"
    + "max-width:420px;margin:15vh auto;padding:0 20px;color:#333;line-height:1.7;text-align:center;";

function page(body) {
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8">`
        + `<meta name="viewport" content="width=device-width,initial-scale=1">`
        + `<meta name="robots" content="noindex"><title>해빛스쿨 메일 수신 거부</title></head>`
        + `<body style="${PAGE_STYLE}">${body}</body></html>`;
}

function confirmPage(actionUrl) {
    // 링크를 여는 것만으로 거부되면 안 된다. 메일 보안 검사기가 링크를 미리 열어 보기 때문이다.
    // 그래서 GET 은 확인 화면만 보이고, 실제 처리는 버튼(POST)으로 한다.
    return page(
        `<h2 style="font-size:20px;">해빛스쿨 안내 메일을 그만 받으시겠어요?</h2>`
        + `<p style="font-size:14px;color:#666;">Stop Habit School emails?</p>`
        + `<form method="post" action="${escapeAttr(actionUrl)}">`
        + `<button type="submit" style="margin-top:16px;padding:12px 28px;border:0;border-radius:8px;`
        + `background:#FF8C00;color:#fff;font-size:16px;font-weight:700;cursor:pointer;">수신 거부 / Unsubscribe</button>`
        + `</form>`
    );
}

const DONE_PAGE = page(
    `<h2 style="font-size:20px;">수신 거부되었습니다</h2>`
    + `<p style="font-size:14px;color:#666;">이제 해빛스쿨 안내 메일을 보내 드리지 않습니다.<br>`
    + `You will no longer get Habit School emails.</p>`
);

const INVALID_PAGE = page(
    `<h2 style="font-size:20px;">링크를 확인하지 못했습니다</h2>`
    + `<p style="font-size:14px;color:#666;">메일에 있는 링크를 그대로 열어 주세요.<br>`
    + `Please open the link exactly as it appears in the email.</p>`
);

/** onRequest 핸들러 본문. 테스트하기 쉽게 db 를 받는다. */
async function handleUnsubscribeRequest(db, req, res) {
    const uid = String(req.query?.u || "");
    const token = String(req.query?.t || "");
    res.set("Cache-Control", "no-store");
    res.set("Content-Type", "text/html; charset=utf-8");

    if (req.method === "GET") {
        if (!uid || !token) {
            res.status(400).send(INVALID_PAGE);
            return;
        }
        res.status(200).send(confirmPage(`${UNSUBSCRIBE_PATH}?${new URLSearchParams({ u: uid, t: token })}`));
        return;
    }
    if (req.method !== "POST") {
        res.status(405).send(INVALID_PAGE);
        return;
    }

    // Gmail 의 원클릭 구독 취소는 본문에 List-Unsubscribe=One-Click 을 담아 POST 한다(RFC 8058).
    const oneClick = String(req.body?.["List-Unsubscribe"] || "") === "One-Click";
    const result = await applyUnsubscribe({ db, uid, token, source: oneClick ? "one-click" : "link" });
    if (!result.ok) {
        res.status(400).send(INVALID_PAGE);
        return;
    }
    res.status(200).send(DONE_PAGE);
}

module.exports = {
    AUTOMATED_EMAIL_MIN_GAP_DAYS,
    UNSUBSCRIBE_PATH,
    sendGuardedMemberEmail,
    handleUnsubscribeRequest,
    _test: {
        toKstDate,
        lastAutomatedEmailDate,
        checkAutomatedEmailAllowed,
        buildUnsubscribeUrl,
        decorateMail,
        tokensMatch,
        applyUnsubscribe,
    },
};
