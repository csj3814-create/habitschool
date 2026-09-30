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
 * 가입하고 아직 한 번도 기록하지 않은 분께 (2026-09-30).
 *
 * 9/19~9/26 가입자 15명 중 기록을 남긴 분이 0명이었다. 자동 안내는 "마지막 기록일"
 * 을 기준으로 돌아서, 기록이 한 번도 없는 분은 아무 안내도 받지 못했다.
 *
 * 포인트는 실제로 받는 것만 적는다. 첫 기록 보너스는 연속 기록 1일(20P)과 첫 식단
 * (15P) 마일스톤을 합한 35P 다(js/firebase-config.js MILESTONES). 가입 축하 200P 는
 * 시작할 습관을 고를 때 들어오므로, 이미 받은 분과 아직인 분께 다르게 말한다.
 */
const FIRST_RECORD_BONUS_POINTS = 35;

function buildFirstRecordEmailTemplate({
    name = "회원",
    welcomeBonusGiven = false,
    appBaseUrl = "",
    locale = "ko",
} = {}) {
    const isEnglish = String(locale || "ko").trim().toLowerCase().startsWith("en");
    const fallbackName = isEnglish ? "there" : "회원";
    const resolvedName = String(name || fallbackName).trim() || fallbackName;
    const link = `${appBaseUrl}/?utm_source=email&utm_medium=onboarding&utm_campaign=first_record`;
    const p = 'style="font-size:15px;color:#333;line-height:1.8;margin:0 0 16px;"';
    const wrap = 'style="font-family:Apple SD Gothic Neo,Malgun Gothic,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:8px 4px;"';
    const button = 'style="display:inline-block;background:#FF8F00;color:#fff;text-decoration:none;padding:12px 28px;border-radius:24px;font-size:15px;font-weight:700;"';

    if (isEnglish) {
        const welcomeLine = welcomeBonusGiven
            ? "Your 200P welcome gift is already in your account."
            : "Pick one habit to start with when you open the app, and you'll get a 200P welcome gift.";
        return {
            locale: "en",
            subject: `${resolvedName}, try leaving just one record`,
            summary: `First-record letter (${welcomeBonusGiven ? "welcome bonus received" : "welcome bonus pending"})`,
            method: "gmail_nodemailer",
            html: `
<div ${wrap}>
  <p ${p}>Hi ${resolvedName},<br>This is Seokjae Choi, the emergency physician who built Habit School.</p>
  <p ${p}>Thank you for signing up. You haven't left a first record yet, so I wanted to write to you myself in case it wasn't clear where to begin.</p>
  <p ${p}>You don't need a big start. <strong>One photo of a meal you ate today</strong> is enough. The AI reads what you ate and how balanced it was right away. A walk or a workout works the same way: one photo or one video.</p>
  <p ${p}>Your first record comes with a ${FIRST_RECORD_BONUS_POINTS}P bonus, and every record adds points. ${welcomeLine} Your first coffee coupon costs 1,400P.</p>
  <p style="margin:24px 0;"><a href="${link}" ${button}>Record one meal today</a></p>
  <p ${p}>If something got in your way when you started, just reply with one line. I read every reply and I'll fix it. If you'd rather not get emails like this, you can tell me that in a reply too.</p>
  <p ${p}>Seokjae Choi</p>
</div>`,
        };
    }

    const welcomeLine = welcomeBonusGiven
        ? "가입 축하 200P는 이미 들어와 있습니다."
        : "들어오셔서 시작할 습관을 하나 고르시면 가입 축하 200P를 드립니다.";
    return {
        locale: "ko",
        subject: `${resolvedName}님, 첫 기록 하나만 남겨 보세요`,
        summary: `첫 기록 안내 편지 (${welcomeBonusGiven ? "가입 축하금 받음" : "가입 축하금 아직"})`,
        method: "gmail_nodemailer",
        html: `
<div ${wrap}>
  <p ${p}>${resolvedName}님, 안녕하세요.<br>해빛스쿨을 만든 응급의학과 전문의 최석재입니다.</p>
  <p ${p}>해빛스쿨에 가입해 주셔서 고맙습니다. 그런데 아직 첫 기록이 없으셔서, 혹시 어디서부터 해야 할지 막막하셨나 싶어 직접 편지를 씁니다.</p>
  <p ${p}>거창하게 시작하실 필요 없습니다. <strong>오늘 드신 한 끼, 사진 한 장</strong>이면 됩니다. 올리시면 AI가 무엇을 드셨는지, 영양은 어땠는지 바로 읽어 드립니다. 걷기나 운동도 사진 한 장, 영상 하나면 됩니다.</p>
  <p ${p}>첫 기록에는 보너스 ${FIRST_RECORD_BONUS_POINTS}P가 붙고, 기록할 때마다 포인트가 쌓입니다. ${welcomeLine} 첫 커피 쿠폰은 1,400P부터 바꾸실 수 있습니다.</p>
  <p ${p}>응급실에서 일하다 보면 큰 병은 어느 날 갑자기 오는 것 같아도, 대개 오랜 생활습관 끝에 찾아온다는 걸 자주 느낍니다. 매일 한 장씩 남기는 작은 습관이 그걸 바꿉니다.</p>
  <p style="margin:24px 0;"><a href="${link}" ${button}>오늘 한 끼 기록하기</a></p>
  <p ${p}>시작하시다 막히는 곳이 있었다면, 이 메일에 한 줄만 답장 주세요. 직접 읽고 고치겠습니다.</p>
  <p style="font-size:13px;color:#888;line-height:1.7;margin:24px 0 0;">이런 안내를 받고 싶지 않으시면 그렇게 답장 주셔도 됩니다.</p>
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
};
