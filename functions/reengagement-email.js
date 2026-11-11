/**
 * 비어 있던 기간을 사람이 읽는 말로. 숫자를 문구에 박아 두면 보내는 시점을 옮길 때
 * 메일이 거짓말을 한다 — 이틀째에 보내면서 "최근 3일간" 이라고 적는 식으로.
 */
function describeGap(gapDays, isEnglish) {
    const days = Number(gapDays);
    if (!Number.isFinite(days) || days < 2) {
        return isEnglish ? "You have not recorded recently" : "최근 기록이 비어 있어요";
    }
    if (days === 2) {
        return isEnglish ? "Yesterday went unrecorded" : "어제 기록이 비어 있었어요";
    }
    return isEnglish
        ? `It has been ${days} days since your last record`
        : `최근 ${days}일간 기록이 없었어요`;
}

/**
 * 오래 쉰 분께 "바쁘셨나 봐요" 라고 하지 않는다.
 *
 * 2026-09-23: 67일 쉬신 분께 나갈 메일을 뽑아 보니 "7일 이상 기록이 없으셔서
 * 바쁘게 보내고 계신 것 같아요" 라고 적혀 있었다. 날짜가 틀린 것도 문제지만,
 * 두 달을 쉰 사람에게 사정을 지어내 붙이는 것이 더 실례다. 짐작은 최근에
 * 멀어진 분께만 어울린다.
 */
const GAP_GUESS_MAX_DAYS = 14;

function describeWhy(gapDays, isEnglish) {
    const days = Number(gapDays);
    if (Number.isFinite(days) && days >= GAP_GUESS_MAX_DAYS) return '';
    return isEnglish ? ' Life probably got busy.' : ' 바쁘게 보내고 계신 것 같아요.';
}

function buildReEngagementEmailTemplate({
    days,
    gapDays = null,
    name = "회원",
    appBaseUrl = "",
    appIconUrl = "",
    locale = "ko",
} = {}) {
    if (![3, 7].includes(Number(days))) {
        throw new Error("days must be 3 or 7");
    }

    const normalizedLocale = String(locale || "ko").trim().toLowerCase().startsWith("en") ? "en" : "ko";
    const isEnglish = normalizedLocale === "en";
    const fallbackName = isEnglish ? "member" : "회원";
    const resolvedName = String(name || fallbackName).trim() || fallbackName;
    const isThreeDay = Number(days) === 3;
    // 몇 일이 비었는지는 tier 가 아니라 실제 공백이 말한다.
    const resolvedGap = gapDays == null ? (isThreeDay ? 3 : 7) : gapDays;
    const gapPhraseKo = describeGap(resolvedGap, false);
    const gapPhraseEn = describeGap(resolvedGap, true);
    const whyKo = describeWhy(resolvedGap, false);
    const whyEn = describeWhy(resolvedGap, true);

    if (isEnglish) {
        const subject = isThreeDay
            ? `[Habit School] ${resolvedName}, ready for one small health check-in today? 🌞`
            : `[Habit School] We miss you, ${resolvedName} 💙`;
        const summary = isThreeDay
            ? `${gapPhraseEn}. A gentle reminder to record food, exercise, or sleep.`
            : `${gapPhraseEn}. An encouraging comeback email.`;
        const html = isThreeDay ? `
<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #f0f0f0;">
  <div style="background:linear-gradient(135deg,#f9a825,#ff7043);padding:32px 24px;text-align:center;">
    <img src="${appIconUrl}" width="60" style="border-radius:12px;" alt="Habit School"/>
    <h2 style="color:#fff;margin:16px 0 4px;font-size:22px;">One healthy check-in today</h2>
    <p style="color:rgba(255,255,255,0.9);margin:0;font-size:15px;">Small records become real change.</p>
  </div>
  <div style="padding:28px 24px;">
    <p style="font-size:16px;color:#333;line-height:1.6;">Hi <strong>${resolvedName}</strong>,</p>
    <p style="font-size:15px;color:#555;line-height:1.7;">${gapPhraseEn}.<br>One food, exercise, or sleep check-in is enough to restart today’s rhythm.</p>
    <div style="text-align:center;margin:28px 0;">
      <a href="${appBaseUrl}" style="background:linear-gradient(135deg,#f9a825,#ff7043);color:#fff;text-decoration:none;padding:14px 36px;border-radius:50px;font-size:16px;font-weight:600;display:inline-block;">Record now</a>
    </div>
    <p style="font-size:13px;color:#aaa;text-align:center;">Consistent records build healthier habits 🌿</p>
  </div>
</div>` : `
<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #f0f0f0;">
  <div style="background:linear-gradient(135deg,#1565c0,#42a5f5);padding:32px 24px;text-align:center;">
    <img src="${appIconUrl}" width="60" style="border-radius:12px;" alt="Habit School"/>
    <h2 style="color:#fff;margin:16px 0 4px;font-size:22px;">We saved your seat, ${resolvedName}</h2>
    <p style="color:rgba(255,255,255,0.9);margin:0;font-size:15px;">Habit School is ready when you are.</p>
  </div>
  <div style="padding:28px 24px;">
    <p style="font-size:16px;color:#333;line-height:1.6;">Hi <strong>${resolvedName}</strong>, hope you are doing well 💙</p>
    <p style="font-size:15px;color:#555;line-height:1.7;">${gapPhraseEn}.${whyEn}<br>Starting again today still counts. We are cheering for you.</p>
    <div style="background:#f8f9ff;border-radius:12px;padding:16px;margin:20px 0;text-align:center;">
      <p style="margin:0;font-size:14px;color:#666;">One record today earns you a <strong style="color:#1565c0;">50P comeback bonus</strong> 🙌</p>
    </div>
    <div style="text-align:center;margin:28px 0;">
      <a href="${appBaseUrl}" style="background:linear-gradient(135deg,#1565c0,#42a5f5);color:#fff;text-decoration:none;padding:14px 36px;border-radius:50px;font-size:16px;font-weight:600;display:inline-block;">Return to Habit School</a>
    </div>
    <p style="font-size:13px;color:#aaa;text-align:center;">You can rebuild a healthy day from one small action ✨</p>
  </div>
</div>`;

        return {
            days: Number(days),
            locale: normalizedLocale,
            subject,
            summary,
            html,
            method: "gmail_nodemailer",
        };
    }

    const subject = isThreeDay
        ? `[해빛스쿨] ${resolvedName}님, 오늘 건강 기록은 어떠세요? 🌞`
        : `[해빛스쿨] ${resolvedName}님이 보고 싶어요 💙`;

    const summary = isThreeDay
        ? `${gapPhraseKo} — 다시 식단·운동·수면 기록을 시작하도록 부드럽게 리마인드하는 메일`
        : `${gapPhraseKo} — 다시 돌아와 기록을 재개하도록 응원하는 메일`;

    const html = isThreeDay ? `
<div style="font-family:Apple SD Gothic Neo,Malgun Gothic,sans-serif;max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #f0f0f0;">
  <div style="background:linear-gradient(135deg,#f9a825,#ff7043);padding:32px 24px;text-align:center;">
    <img src="${appIconUrl}" width="60" style="border-radius:12px;" alt="해빛스쿨"/>
    <h2 style="color:#fff;margin:16px 0 4px;font-size:22px;">오늘도 건강 기록 한 번 톡</h2>
    <p style="color:rgba(255,255,255,0.9);margin:0;font-size:15px;">작은 기록이 큰 변화를 만들어요</p>
  </div>
  <div style="padding:28px 24px;">
    <p style="font-size:16px;color:#333;line-height:1.6;"><strong>${resolvedName}</strong>님, 안녕하세요 :)</p>
    <p style="font-size:15px;color:#555;line-height:1.7;">${gapPhraseKo}.<br>오늘 식단, 운동, 수면 기록 한 번만 해도 스트릭이 이어져요!</p>
    <div style="text-align:center;margin:28px 0;">
      <a href="${appBaseUrl}" style="background:linear-gradient(135deg,#f9a825,#ff7043);color:#fff;text-decoration:none;padding:14px 36px;border-radius:50px;font-size:16px;font-weight:600;display:inline-block;">지금 기록하러 가기</a>
    </div>
    <p style="font-size:13px;color:#aaa;text-align:center;">꾸준한 기록은 건강한 습관을 만듭니다 🌿</p>
  </div>
</div>` : `
<div style="font-family:Apple SD Gothic Neo,Malgun Gothic,sans-serif;max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #f0f0f0;">
  <div style="background:linear-gradient(135deg,#1565c0,#42a5f5);padding:32px 24px;text-align:center;">
    <img src="${appIconUrl}" width="60" style="border-radius:12px;" alt="해빛스쿨"/>
    <h2 style="color:#fff;margin:16px 0 4px;font-size:22px;">${resolvedName}님이 보고 싶었어요</h2>
    <p style="color:rgba(255,255,255,0.9);margin:0;font-size:15px;">해빛스쿨은 건강한 여정을 기다리고 있어요</p>
  </div>
  <div style="padding:28px 24px;">
    <p style="font-size:16px;color:#333;line-height:1.6;"><strong>${resolvedName}</strong>님, 잘 지내고 계신가요? 💙</p>
    <p style="font-size:15px;color:#555;line-height:1.7;">${gapPhraseKo}.${whyKo}<br>오늘 다시 시작해도 전혀 늦지 않아요. 해빛스쿨이 응원합니다!</p>
    <div style="background:#f8f9ff;border-radius:12px;padding:16px;margin:20px 0;text-align:center;">
      <!-- 금액을 적는다. 예전에는 '복귀 보너스' 라고만 했는데 그런 보상이 아예 없었다.
           이제는 있고(functions/comeback-bonus.js), 숫자를 적어야 약속이 확인 가능해진다.
           금액을 바꾸면 이 문구도 같이 바꿔야 한다. -->
      <p style="margin:0;font-size:14px;color:#666;">오늘 기록 한 번이면 <strong style="color:#1565c0;">복귀 보너스 50P</strong>를 드려요 🙌</p>
    </div>
    <div style="text-align:center;margin:28px 0;">
      <a href="${appBaseUrl}" style="background:linear-gradient(135deg,#1565c0,#42a5f5);color:#fff;text-decoration:none;padding:14px 36px;border-radius:50px;font-size:16px;font-weight:600;display:inline-block;">해빛스쿨로 돌아가기</a>
    </div>
    <p style="font-size:13px;color:#aaa;text-align:center;">당신의 건강한 하루를 다시 만들 수 있어요 ✨</p>
  </div>
</div>`;

    return {
        days: Number(days),
        locale: normalizedLocale,
        subject,
        summary,
        html,
        method: "gmail_nodemailer",
    };
}

/**
 * 오래 쉰 분께 보내는 편지 (복귀 캠페인, 2026-09-30).
 *
 * 9/23 46~90일 캠페인은 위 7일 안내("보고 싶어요")를 그대로 보냈고, 47명 중 1주 안에
 * 앱을 연 분 3명, 기록한 분 0명이었다. 두 달 넘게 쉰 분께 "돌아와 달라" 는 이유가
 * 되지 않는다. 그래서 이 편지는 **그동안 달라진 것**으로 시작하고, 만든 사람 이름으로
 * 짧게 쓴다. 광고처럼 보이는 색 띠와 큰 그림은 빼고 편지 모양으로 둔다.
 *
 * 적는 기능은 모두 CHANGELOG 에 있는 것만이다(v401·v410·v436·v450·v456).
 * 링크에는 utm 꼬리표를 붙인다 — 46~90일 때는 메일로 들어왔는지조차 셀 수 없었다.
 */
const COMEBACK_FILM_URL = "https://youtube.com/shorts/JkasQIYmo_A";

function describeMonthsAgo(gapDays, isEnglish) {
    const days = Number(gapDays);
    if (!Number.isFinite(days) || days < 30) {
        return isEnglish ? "It has been a while since your last record." : "한동안 기록이 없으셨네요.";
    }
    const months = Math.floor(days / 30);
    return isEnglish
        ? `Your last record was about ${months} months ago.`
        : `마지막 기록이 벌써 ${months}개월 전이네요.`;
}

function buildComebackNewsEmailTemplate({
    gapDays = null,
    name = "회원",
    appBaseUrl = "",
    locale = "ko",
    campaign = "comeback",
} = {}) {
    const isEnglish = String(locale || "ko").trim().toLowerCase().startsWith("en");
    const fallbackName = isEnglish ? "there" : "회원";
    const resolvedName = String(name || fallbackName).trim() || fallbackName;
    const link = `${appBaseUrl}/?utm_source=email&utm_medium=winback&utm_campaign=${encodeURIComponent(campaign)}`;
    const p = 'style="font-size:15px;color:#333;line-height:1.8;margin:0 0 16px;"';
    const h = 'style="font-size:15px;color:#333;line-height:1.7;margin:20px 0 4px;font-weight:700;"';
    const wrap = 'style="font-family:Apple SD Gothic Neo,Malgun Gothic,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:8px 4px;"';
    const button = `style="display:inline-block;background:#FF8F00;color:#fff;text-decoration:none;padding:12px 28px;border-radius:24px;font-size:15px;font-weight:700;"`;

    if (isEnglish) {
        return {
            days: 7,
            locale: "en",
            subject: `${resolvedName}, it's Seokjae Choi from Habit School`,
            summary: "Comeback letter: what changed while you were away",
            method: "gmail_nodemailer",
            html: `
<div ${wrap}>
  <p ${p}>Hi ${resolvedName},</p>
  <p ${p}>This is Seokjae Choi, the emergency physician who built Habit School. ${describeMonthsAgo(gapDays, true)}</p>
  <p ${p}>A lot has changed since then. Three things worth knowing:</p>
  <p ${h}>1. Just upload the photo</p>
  <p ${p}>Food and sleep photos are analyzed the moment you upload them, and AI now reads exercise photos and videos too.</p>
  <p ${h}>2. Your health scores, every day</p>
  <p ${p}>Your habit score and metabolic health score sit at the top of your records. Blood test reports can go in as a photo, PDF or Excel file.</p>
  <p ${h}>3. Your first coffee comes sooner</p>
  <p ${p}>Your first coffee coupon costs 1,400P instead of 2,000P.</p>
  <p ${p}>Record once on the day you come back and you get a 50P comeback bonus.</p>
  <p style="margin:24px 0;"><a href="${link}" ${button}>Record one meal today</a></p>
  <p ${p}>If you'd rather not get news like this, just reply to this email and I'll stop.</p>
  <p ${p}>Seokjae Choi</p>
</div>`,
        };
    }

    return {
        days: 7,
        locale: "ko",
        subject: `${resolvedName}님, 해빛스쿨 만든 최석재입니다`,
        summary: "복귀 편지 — 쉬는 동안 달라진 것 세 가지",
        method: "gmail_nodemailer",
        html: `
<div ${wrap}>
  <p ${p}>${resolvedName}님, 안녕하세요.<br>해빛스쿨을 만든 응급의학과 전문의 최석재입니다.</p>
  <p ${p}>${describeMonthsAgo(gapDays, false)} 그동안 회원분들이 알려 주신 불편을 하나씩 고치다 보니, 해빛스쿨이 꽤 달라졌습니다. 세 가지만 말씀드릴게요.</p>
  <p ${h}>1. 사진만 올리시면 됩니다</p>
  <p ${p}>식단·수면 사진은 올리는 순간 AI 분석이 시작됩니다. 이제는 운동 사진과 영상도 AI가 보고, 어떤 운동을 얼마나 세게 했는지 읽어 드립니다.</p>
  <p ${h}>2. 건강 점수를 매일 봅니다</p>
  <p ${p}>내 기록 탭 맨 위에서 건강습관 점수와 대사건강 점수를 바로 확인하실 수 있습니다. 병원에서 받은 혈액검사 결과지도 사진이나 PDF, 엑셀 파일 그대로 올리시면 AI가 수치를 읽어 정리해 드립니다.</p>
  <p ${h}>3. 첫 커피가 가까워졌습니다</p>
  <p ${p}>기록으로 모은 포인트로 커피 쿠폰을 받으실 수 있는데, 첫 교환은 2,000P가 아니라 1,400P입니다.</p>
  <p ${p}>응급실에서 일하다 보면, 큰 병은 어느 날 갑자기 오는 것 같아도 대개 오랜 생활습관 끝에 찾아온다는 걸 자주 느낍니다. 거창한 결심보다 오늘 한 끼를 사진 한 장으로 남기는 쪽이 오래갑니다.</p>
  <p ${p}>다시 기록하시는 날에는 복귀 보너스 50P를 드립니다.</p>
  <p style="margin:24px 0;"><a href="${link}" ${button}>오늘 한 끼 기록하기</a></p>
  <p ${p}>P.S. 기록이 왜 가족의 건강으로 이어지는지, 1분짜리 영상으로 만들어 봤습니다. <a href="${COMEBACK_FILM_URL}" style="color:#E65100;">「아침 식탁」 보기</a></p>
  <p style="font-size:13px;color:#888;line-height:1.7;margin:24px 0 0;">이런 소식을 더 받고 싶지 않으시면 이 메일에 답장만 주세요. 다시 보내지 않겠습니다.</p>
  <p ${p}>최석재 드림</p>
</div>`,
    };
}

/**
 * 오래 쉰 단골께 보내는 개인 편지 (2026-11-11, 관리자가 눌러야만 나간다).
 *
 * 9/23·9/30 복귀 캠페인은 모두에게 같은 글이었고 14일 안에 돌아온 분이 47명 중 2명,
 * 63명 중 2명이었다. 한편 기록이 하루 끊긴 분께 가는 안내는 56% 가 돌아온다. 그래서
 * 이번 편지는 기능 소개로 시작하지 않고 **그분이 직접 남긴 기록**으로 시작한다 —
 * 며칠을, 언제부터 언제까지, 그리고 그 사이에 만든 숫자 하나. 숫자는 그분의 daily_logs
 * 에서 센 것만 쓴다. 그다음 쉬시는 동안 달라진 것을 2~3개(그분 마지막 기록일 뒤에 나온
 * CHANGELOG 항목에서만), 마지막으로 날짜가 박힌 제안 하나(4주 소모임)와 버튼 하나.
 *
 * 대상은 마지막 기록이 45일 넘게 지났고(자동 안내는 2~45일만 맡는다) 기록한 날이
 * 10일 이상인 분. 2026-11-11 운영 기준 26명 안팎이다.
 */
const WINBACK_CAMPAIGN = "dormant_personal_v1";
const WINBACK_MIN_GAP_DAYS = 45;   // 이보다 길게(초과) 쉬어야 한다. 그 안쪽은 자동 안내 몫이다.
const WINBACK_MIN_RECORD_DAYS = 10;
const WINBACK_MAX_UPDATES = 3;

// 소모임 규칙 (functions/runtime.js EXERCISE_GROUP_* · CHANGELOG v596). 바꾸면 여기도 바꾼다.
const WINBACK_GROUP_TARGET = 14;
const WINBACK_GROUP_REWARD_POINTS = 1000;
const WINBACK_GROUP_ENTRY_FEE_POINTS = 200;
const WINBACK_GROUP_WINDOW_DAYS = 28;

/**
 * 쉬시는 동안 달라진 것. CHANGELOG 에 있는 항목만, 혜택으로 읽히는 것만, 앞쪽이 먼저다.
 * 회원마다 마지막 기록일 **뒤에** 나온 것만 골라 앞에서부터 세 개까지 쓴다.
 * 날짜·버전은 tests/dormant-winback-letter.test.js 가 CHANGELOG 와 맞춰 본다.
 */
const WINBACK_UPDATES = Object.freeze([
    Object.freeze({
        version: "v401", date: "2026-09-14",
        ko: "식단·수면 사진을 올리면 AI 분석이 저절로 시작됩니다.",
        en: "Food and sleep photos are analyzed the moment you upload them.",
    }),
    Object.freeze({
        version: "v410", date: "2026-09-15",
        ko: "운동 영상도 AI가 보고, 어떤 운동을 얼마나 세게 했는지 읽어 드립니다.",
        en: "AI now watches your exercise videos and tells you what you did and how hard.",
    }),
    Object.freeze({
        version: "v450", date: "2026-09-24",
        ko: "내 기록 탭 맨 위에서 건강습관 점수와 대사건강 점수를 매일 봅니다.",
        en: "Your habit score and metabolic health score sit at the top of your records, every day.",
    }),
    Object.freeze({
        version: "v508", date: "2026-10-15",
        ko: "식단 사진을 한 번에 여러 장 올릴 수 있고, AI가 음식을 더 정확하게 알아봅니다.",
        en: "You can upload several food photos at once, and the AI recognizes food more accurately.",
    }),
    Object.freeze({
        version: "v456", date: "2026-09-26",
        ko: "혈액검사 결과지를 PDF나 엑셀 파일 그대로 올리면 AI가 수치를 읽어 드립니다.",
        en: "Blood test reports can go in as a PDF or Excel file, and the AI reads the numbers.",
    }),
    Object.freeze({
        version: "v507", date: "2026-10-14",
        ko: "AI 분석이 틀렸으면 고칠 점을 적어 다시 분석할 수 있습니다.",
        en: "If an AI analysis is wrong, tell it what to fix and it analyzes again.",
    }),
]);

function pickWinbackUpdates(lastRecordDate, limit = WINBACK_MAX_UPDATES) {
    const since = String(lastRecordDate || "");
    return WINBACK_UPDATES.filter((update) => update.date > since).slice(0, limit);
}

/** 기록한 날 — 포인트를 받은 날(js/activity-days.js isActiveAward)이거나 아침 지표를 적은 날. */
function isWinbackRecordDay(log = {}) {
    const awarded = log.awardedPoints || log.awarded || {};
    if (Number(awarded.dietPoints || 0) > 0
        || Number(awarded.exercisePoints || 0) > 0
        || Number(awarded.mindPoints || 0) > 0
        || awarded.diet === true || awarded.exercise === true || awarded.mind === true) {
        return true;
    }
    const metrics = log.metrics || {};
    return ["weight", "glucose", "bpSystolic", "bpDiastolic"]
        .some((key) => Number(metrics[key]) > 0);
}

function shiftDate(dateStr, days) {
    const date = new Date(`${dateStr}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function dayGap(fromDateStr, toDateStr) {
    const from = Date.parse(`${fromDateStr}T12:00:00Z`);
    const to = Date.parse(`${toDateStr}T12:00:00Z`);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
    return Math.round((to - from) / 86400000);
}

/**
 * 체중 변화. 오입력(59 → 159 같은)은 그분 체중의 가운데 값에서 15% 넘게 벗어나면 뺀다.
 * 줄어든 경우에만 돌려준다 — 편지는 해낸 것만 말한다.
 */
function describeWeightLoss(weighIns = []) {
    const rows = weighIns
        .filter(([date, kg]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && kg >= 25 && kg <= 250)
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    if (rows.length < 2) return null;
    const sorted = rows.map(([, kg]) => kg).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const sane = rows.filter(([, kg]) => Math.abs(kg - median) <= median * 0.15);
    if (sane.length < 2) return null;
    const [startDate, startKg] = sane[0];
    const [endDate, endKg] = sane[sane.length - 1];
    if (startDate === endDate) return null;
    const lossKg = Math.round((startKg - endKg) * 10) / 10;
    if (lossKg < 1) return null;
    return { startKg, endKg, lossKg, startDate, endDate };
}

/**
 * 한 분의 daily_logs 로 편지에 쓸 숫자를 만든다. 지어내는 숫자가 없게, 여기서 센 것만 쓴다.
 * highlight 는 하나만: 체중이 1kg 이상 줄었으면 그것, 아니면 가장 긴 연속 기록(3일 이상),
 * 아니면 운동한 날(5일 이상), 아무것도 아니면 null.
 */
function summarizeWinbackHistory(logs = [], todayStr = "") {
    const dates = new Set();
    const exerciseDates = new Set();
    const weighIns = new Map();
    (Array.isArray(logs) ? logs : []).forEach((log) => {
        const date = String(log?.date || "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isWinbackRecordDay(log)) return;
        dates.add(date);
        const awarded = log.awardedPoints || log.awarded || {};
        if (Number(awarded.exercisePoints || 0) > 0 || awarded.exercise === true) exerciseDates.add(date);
        const kg = Number(log.metrics?.weight);
        if (kg > 0) weighIns.set(date, kg);
    });
    const sortedDates = [...dates].sort();
    if (!sortedDates.length) {
        return { recordDays: 0, firstDate: "", lastDate: "", gapDays: null, longestStreak: 0, exerciseDays: 0, weightLoss: null, highlight: null };
    }

    let longestStreak = 1;
    let run = 1;
    for (let i = 1; i < sortedDates.length; i += 1) {
        run = dayGap(sortedDates[i - 1], sortedDates[i]) === 1 ? run + 1 : 1;
        if (run > longestStreak) longestStreak = run;
    }

    const weightLoss = describeWeightLoss([...weighIns.entries()]);
    const exerciseDays = exerciseDates.size;
    let highlight = null;
    if (weightLoss) highlight = { kind: "weight_loss", ...weightLoss };
    else if (longestStreak >= 3) highlight = { kind: "streak", days: longestStreak };
    else if (exerciseDays >= 5) highlight = { kind: "exercise_days", days: exerciseDays };

    const lastDate = sortedDates[sortedDates.length - 1];
    return {
        recordDays: sortedDates.length,
        firstDate: sortedDates[0],
        lastDate,
        gapDays: todayStr ? dayGap(lastDate, todayStr) : null,
        longestStreak,
        exerciseDays,
        weightLoss,
        highlight,
    };
}

/** 이번 편지를 받을 만한 분인가. 이유를 함께 돌려줘서 미리보기가 빠진 사람도 셀 수 있게 한다. */
function decideWinbackTarget(history = {}) {
    if (!history.recordDays) return { eligible: false, reason: "no_record" };
    if (!(history.gapDays > WINBACK_MIN_GAP_DAYS)) return { eligible: false, reason: "recent" };
    if (history.recordDays < WINBACK_MIN_RECORD_DAYS) return { eligible: false, reason: "few_days" };
    return { eligible: true, reason: "eligible" };
}

/** 오늘 다음에 오는 월요일 (오늘이 월요일이면 다음 주 월요일). 새 출발은 주의 시작이 쉽다. */
function nextMondayAfter(todayStr) {
    const day = new Date(`${todayStr}T12:00:00Z`).getUTCDay(); // 0=일
    const ahead = ((8 - day) % 7) || 7;
    return shiftDate(todayStr, ahead);
}

const KO_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const EN_WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatWinbackDate(dateStr, isEnglish, { withYear = false } = {}) {
    const [y, m, d] = String(dateStr).split("-").map(Number);
    if (isEnglish) return `${EN_MONTHS[m - 1]} ${d}${withYear ? `, ${y}` : ""}`;
    return `${withYear ? `${y}년 ` : ""}${m}월 ${d}일`;
}

function weekdayOf(dateStr, isEnglish) {
    const day = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
    return isEnglish ? EN_WEEKDAYS[day] : `${KO_WEEKDAYS[day]}요일`;
}

function describeHighlight(highlight, isEnglish) {
    if (!highlight) return "";
    if (highlight.kind === "weight_loss") {
        return isEnglish
            ? `In that time your weight went from ${highlight.startKg}kg to ${highlight.endKg}kg, ${highlight.lossKg}kg down.`
            : `그 사이 체중이 ${highlight.startKg}kg에서 ${highlight.endKg}kg으로 ${highlight.lossKg}kg 줄었습니다.`;
    }
    if (highlight.kind === "streak") {
        return isEnglish
            ? `Your longest run was ${highlight.days} days in a row.`
            : `가장 길게는 ${highlight.days}일을 하루도 빠짐없이 이어 가셨습니다.`;
    }
    if (highlight.kind === "exercise_days") {
        return isEnglish
            ? `On ${highlight.days} of those days you also logged a workout.`
            : `그중 ${highlight.days}일은 운동까지 기록하셨습니다.`;
    }
    return "";
}

function buildDormantWinbackEmailTemplate({
    name = "회원",
    history = {},
    updates = [],
    startDate = "",
    todayStr = "",
    coins = 0,
    comebackBonusPoints = 0,
    link = "",
    locale = "ko",
} = {}) {
    const isEnglish = String(locale || "ko").trim().toLowerCase().startsWith("en");
    const fallbackName = isEnglish ? "there" : "회원";
    // 이름은 회원이 직접 쓴 글이다. 메일 본문 HTML 에 그대로 넣지 않는다.
    const resolvedName = (String(name || fallbackName).trim() || fallbackName)
        .replace(/[<>&"]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[ch]));
    const thisYear = String(todayStr || "").slice(0, 4);
    const withYear = !!thisYear && (String(history.firstDate).slice(0, 4) !== thisYear || String(history.lastDate).slice(0, 4) !== thisYear);
    const from = formatWinbackDate(history.firstDate, isEnglish, { withYear });
    const to = formatWinbackDate(history.lastDate, isEnglish, { withYear });
    const endDate = shiftDate(startDate, WINBACK_GROUP_WINDOW_DAYS - 1);
    const startLabel = formatWinbackDate(startDate, isEnglish);
    const endLabel = formatWinbackDate(endDate, isEnglish);
    const weekday = weekdayOf(startDate, isEnglish);
    const highlightLine = describeHighlight(history.highlight, isEnglish);
    const canAffordFee = Number(coins) >= WINBACK_GROUP_ENTRY_FEE_POINTS;

    const p = 'style="font-size:15px;color:#333;line-height:1.8;margin:0 0 16px;"';
    const small = 'style="font-size:13px;color:#888;line-height:1.7;margin:0 0 12px;"';
    const li = 'style="margin:0 0 6px;"';
    const wrap = 'style="font-family:Apple SD Gothic Neo,Malgun Gothic,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:8px 4px;"';
    const button = 'style="display:inline-block;background:#FF8F00;color:#fff;text-decoration:none;padding:14px 32px;border-radius:24px;font-size:16px;font-weight:700;"';
    const updateList = updates.length
        ? `<ul style="font-size:15px;color:#333;line-height:1.7;margin:0 0 16px;padding-left:20px;">${updates.map((u) => `<li ${li}>${isEnglish ? u.en : u.ko}</li>`).join("")}</ul>`
        : "";
    const summary = `${isEnglish ? "Personal win-back letter" : "오래 쉰 단골 개인 편지"} · ${history.recordDays}${isEnglish ? " days" : "일"} · ${history.highlight?.kind || "none"} · ${startDate}`;

    if (isEnglish) {
        const feeLine = canAffordFee
            ? `The ${WINBACK_GROUP_ENTRY_FEE_POINTS}P entry fee is covered by the ${coins}P you already have.`
            : `The entry fee is ${WINBACK_GROUP_ENTRY_FEE_POINTS}P.`;
        const bonusLine = comebackBonusPoints > 0 ? ` The day you record again, you also get a ${comebackBonusPoints}P comeback bonus.` : "";
        return {
            locale: "en",
            campaign: WINBACK_CAMPAIGN,
            subject: `${resolvedName}, I looked back at your ${history.recordDays} days`,
            summary,
            method: "gmail_nodemailer",
            html: `
<div ${wrap}>
  <p ${p}>Hi ${resolvedName}, this is Seokjae Choi, the emergency physician who built Habit School.</p>
  <p ${p}>From ${from} to ${to}, you recorded on <strong>${history.recordDays} days</strong>. ${highlightLine}</p>
  ${updateList ? `<p ${p}>Here's what changed while you were away:</p>\n  ${updateList}` : ""}
  <p ${p}>So here's one idea with a date on it: <strong>join an exercise group on ${weekday}, ${startLabel}</strong>. Check in ${WINBACK_GROUP_TARGET} workouts in the 4 weeks and you get ${WINBACK_GROUP_REWARD_POINTS.toLocaleString("en-US")}P.</p>
  <p style="margin:24px 0;"><a href="${link}" ${button}>See the groups</a></p>
  <p ${small}>Your 4 weeks start the day you join — join on ${startLabel} and they run to ${endLabel}. ${feeLine}${bonusLine}</p>
  <p ${small}>If you'd rather not get emails like this, just reply and I'll stop.</p>
  <p ${p}>Seokjae Choi</p>
</div>`,
        };
    }

    const feeLine = canAffordFee
        ? `참가비 ${WINBACK_GROUP_ENTRY_FEE_POINTS}P는 지금 가지신 ${Number(coins).toLocaleString("ko-KR")}P로 충분합니다.`
        : `참가비는 ${WINBACK_GROUP_ENTRY_FEE_POINTS}P입니다.`;
    const bonusLine = comebackBonusPoints > 0 ? ` 다시 기록하시는 날에는 복귀 보너스 ${comebackBonusPoints}P도 드립니다.` : "";
    return {
        locale: "ko",
        campaign: WINBACK_CAMPAIGN,
        subject: `${resolvedName}님, 기록하신 ${history.recordDays}일을 다시 꺼내 봤습니다`,
        summary,
        method: "gmail_nodemailer",
        html: `
<div ${wrap}>
  <p ${p}>${resolvedName}님, 안녕하세요. 해빛스쿨을 만든 응급의학과 전문의 최석재입니다.</p>
  <p ${p}>${resolvedName}님은 ${from}부터 ${to}까지 <strong>${history.recordDays}일</strong>을 기록하셨습니다. ${highlightLine}</p>
  ${updateList ? `<p ${p}>쉬시는 동안 해빛스쿨이 이렇게 달라졌습니다.</p>\n  ${updateList}` : ""}
  <p ${p}>그래서 날짜를 하나 정해 제안드립니다. <strong>${startLabel} ${weekday}, 운동 소모임에 함께해 주세요.</strong> 4주 동안 운동을 ${WINBACK_GROUP_TARGET}번 인증하시면 ${WINBACK_GROUP_REWARD_POINTS.toLocaleString("ko-KR")}P를 드립니다.</p>
  <p style="margin:24px 0;"><a href="${link}" ${button}>소모임 보러 가기</a></p>
  <p ${small}>4주는 들어오신 날부터 셉니다. ${startLabel}에 들어오시면 ${endLabel}까지입니다. ${feeLine}${bonusLine}</p>
  <p ${small}>이런 편지를 받고 싶지 않으시면 답장으로 알려 주세요. 다시 보내지 않겠습니다.</p>
  <p ${p}>최석재 드림</p>
</div>`,
    };
}

/**
 * 가입하고 아직 한 번도 기록하지 않은 분께 (2026-09-30, 2026-11-11 고침).
 *
 * 9/19~9/26 가입자 15명 중 기록을 남긴 분이 0명이었다. 자동 안내는 "마지막 기록일"
 * 을 기준으로 돌아서, 기록이 한 번도 없는 분은 아무 안내도 받지 못했다.
 *
 * 2026-11-11: 10월 이후 이 편지를 받고 일주일 안에 기록한 분이 26명 중 1명(4%)이었다.
 * 같은 기간 기록이 하루 끊긴 분께 가는 안내는 56% 가 돌아왔다. 다른 점은 둘이다.
 *   1. 늦다. 가입 이틀째에 갔다. 끊긴 쪽도 늦게 보낼수록(7일째) 23% 로 떨어진다.
 *   2. 길고, 할 일이 흐리다. 일곱 문단에 한 끼·걷기·운동·커피 쿠폰·응급실 이야기가
 *      섞였고, 버튼은 앱 첫 화면을 열어 거기서 다시 식단 탭을 찾아야 했다.
 * 그래서 가입 다음 날 아침에 보내고(runtime.js), 할 일을 **지금 눈앞의 먹을 것 한 장**
 * 하나로 줄이고, 버튼은 식단 탭의 사진 올리기를 바로 연다(?tab=diet&focus=upload,
 * 알림이 쓰는 주소와 같다).
 *
 * 포인트는 실제로 받는 것만 적는다. 첫 기록 보너스는 연속 기록 1일(20P)과 첫 식단
 * (15P) 마일스톤을 합한 35P 다(js/firebase-config.js MILESTONES). 가입 축하 200P 는
 * 시작할 습관을 고를 때 들어오므로, 이미 받은 분과 아직인 분께 다르게 말한다.
 */
const FIRST_RECORD_BONUS_POINTS = 35;

function buildFirstRecordLink(appBaseUrl, isEnglish) {
    const utm = "utm_source=email&utm_medium=onboarding&utm_campaign=first_record";
    // 영어 앱은 탭을 해시로 받는다(functions/runtime.js buildLocalizedAppPath).
    return isEnglish
        ? `${appBaseUrl}?focus=upload&${utm}#diet`
        : `${appBaseUrl}/?tab=diet&focus=upload&${utm}`;
}

function buildFirstRecordEmailTemplate({
    name = "회원",
    welcomeBonusGiven = false,
    appBaseUrl = "",
    locale = "ko",
} = {}) {
    const isEnglish = String(locale || "ko").trim().toLowerCase().startsWith("en");
    const fallbackName = isEnglish ? "there" : "회원";
    const resolvedName = String(name || fallbackName).trim() || fallbackName;
    const link = buildFirstRecordLink(appBaseUrl, isEnglish);
    const p = 'style="font-size:15px;color:#333;line-height:1.8;margin:0 0 16px;"';
    const small = 'style="font-size:13px;color:#888;line-height:1.7;margin:0 0 12px;"';
    const wrap = 'style="font-family:Apple SD Gothic Neo,Malgun Gothic,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:8px 4px;"';
    const button = 'style="display:inline-block;background:#FF8F00;color:#fff;text-decoration:none;padding:14px 32px;border-radius:24px;font-size:16px;font-weight:700;"';

    if (isEnglish) {
        const welcomeLine = welcomeBonusGiven
            ? "Your 200P welcome gift is already in your account."
            : "Pick one habit to start with and you'll also get a 200P welcome gift.";
        return {
            locale: "en",
            subject: `${resolvedName}, one photo of what's in front of you`,
            summary: `First-record letter (${welcomeBonusGiven ? "welcome bonus received" : "welcome bonus pending"})`,
            method: "gmail_nodemailer",
            html: `
<div ${wrap}>
  <p ${p}>Hi ${resolvedName}, this is Seokjae Choi, the doctor who built Habit School. Thanks for signing up.</p>
  <p ${p}>Starting takes one photo. <strong>Take a picture of whatever you're about to eat or drink right now</strong> — a coffee or a snack counts. The AI tells you what it is and what's good about it right away.</p>
  <p style="margin:24px 0;"><a href="${link}" ${button}>Take a food photo</a></p>
  <p ${small}>Your first record comes with a ${FIRST_RECORD_BONUS_POINTS}P bonus. ${welcomeLine}</p>
  <p ${small}>Stuck somewhere? Reply with one line and I'll fix it. To stop emails like this, just say so in a reply.</p>
  <p ${p}>Seokjae Choi</p>
</div>`,
        };
    }

    const welcomeLine = welcomeBonusGiven
        ? "가입 축하 200P는 이미 들어와 있습니다."
        : "시작할 습관을 하나 고르시면 가입 축하 200P도 드립니다.";
    return {
        locale: "ko",
        subject: `${resolvedName}님, 지금 눈앞의 먹을 것 한 장만 찍어 보세요`,
        summary: `첫 기록 안내 편지 (${welcomeBonusGiven ? "가입 축하금 받음" : "가입 축하금 아직"})`,
        method: "gmail_nodemailer",
        html: `
<div ${wrap}>
  <p ${p}>${resolvedName}님, 안녕하세요. 해빛스쿨을 만든 응급의학과 전문의 최석재입니다. 가입해 주셔서 고맙습니다.</p>
  <p ${p}>시작은 사진 한 장이면 됩니다. <strong>지금 눈앞에 있는 먹을 것을 찍어 올려 보세요.</strong> 커피 한 잔, 과자 하나도 괜찮습니다. 무엇인지, 어떤 점이 좋은지 AI가 바로 알려 드립니다.</p>
  <p style="margin:24px 0;"><a href="${link}" ${button}>식단 사진 찍기</a></p>
  <p ${small}>첫 기록에는 보너스 ${FIRST_RECORD_BONUS_POINTS}P가 붙습니다. ${welcomeLine}</p>
  <p ${small}>막히는 곳이 있으면 이 메일에 한 줄만 답장 주세요. 직접 읽고 고치겠습니다. 이런 안내를 받고 싶지 않으시면 그렇게 답장 주셔도 됩니다.</p>
  <p ${p}>최석재 드림</p>
</div>`,
    };
}

/**
 * 이번 공백에 대해 이 단계의 안내를 이미 보냈는지.
 *
 * 이 판단이 없으면 자동 발송을 켜는 순간 스팸이 된다. 발송 대상은 "3일 이상 기록이
 * 없는 사람" 이라서, 한 번 멀어진 사람은 돌아오기 전까지 매일 대상에 남는다.
 * 한 달 쉰 사람에게 서른 통을 보내는 셈이다.
 *
 * 기준은 "마지막 기록일 이후에 보낸 적이 있는가" 하나다. 다시 기록을 남기면 마지막
 * 기록일이 발송일보다 뒤로 가므로, 그 다음에 또 멀어졌을 때는 다시 보낸다 —
 * 사람마다 공백은 여러 번 생기고, 각 공백은 각각 안내할 값어치가 있다.
 *
 * @param {{sentAt?: string}|null} historyEntry emailLogs 의 해당 단계 기록
 * @param {string|null} lastLogDate 마지막 기록일 'YYYY-MM-DD' (기록이 없으면 null)
 * @returns {boolean}
 */
function alreadyNudgedForGap(historyEntry, lastLogDate) {
    const sentAt = String(historyEntry?.sentAt || "").trim();
    if (!sentAt) return false;
    // 기록이 한 번도 없는 사람에게는 공백의 시작이 없다. 단계당 한 번이면 충분하다.
    if (!lastLogDate) return true;
    return sentAt.slice(0, 10) > String(lastLogDate);
}

module.exports = {
    describeWhy,
    describeGap,
    buildReEngagementEmailTemplate,
    buildComebackNewsEmailTemplate,
    buildFirstRecordEmailTemplate,
    alreadyNudgedForGap,
    WINBACK_CAMPAIGN,
    WINBACK_MIN_GAP_DAYS,
    WINBACK_MIN_RECORD_DAYS,
    WINBACK_UPDATES,
    pickWinbackUpdates,
    isWinbackRecordDay,
    summarizeWinbackHistory,
    decideWinbackTarget,
    nextMondayAfter,
    buildDormantWinbackEmailTemplate,
};
