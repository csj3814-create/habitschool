function buildReEngagementEmailTemplate({
    days,
    name = "회원",
    appBaseUrl = "",
    appIconUrl = "",
} = {}) {
    if (![3, 7].includes(Number(days))) {
        throw new Error("days must be 3 or 7");
    }

    const resolvedName = String(name || "회원").trim() || "회원";
    const isThreeDay = Number(days) === 3;

    const subject = isThreeDay
        ? `[해빛스쿨] ${resolvedName}님, 오늘 건강 기록은 어떠세요? 🌞`
        : `[해빛스쿨] ${resolvedName}님이 보고 싶어요 💙`;

    const summary = isThreeDay
        ? "최근 3일간 기록이 없어 다시 식단·운동·수면 기록을 시작하도록 부드럽게 리마인드하는 메일"
        : "최근 7일 이상 기록이 없는 사용자가 다시 돌아와 기록을 재개하도록 응원하는 메일";

    const html = isThreeDay ? `
<div style="font-family:Apple SD Gothic Neo,Malgun Gothic,sans-serif;max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #f0f0f0;">
  <div style="background:linear-gradient(135deg,#f9a825,#ff7043);padding:32px 24px;text-align:center;">
    <img src="${appIconUrl}" width="60" style="border-radius:12px;" alt="해빛스쿨"/>
    <h2 style="color:#fff;margin:16px 0 4px;font-size:22px;">오늘도 건강 기록 한 번 톡</h2>
    <p style="color:rgba(255,255,255,0.9);margin:0;font-size:15px;">작은 기록이 큰 변화를 만들어요</p>
  </div>
  <div style="padding:28px 24px;">
    <p style="font-size:16px;color:#333;line-height:1.6;"><strong>${resolvedName}</strong>님, 안녕하세요 :)</p>
    <p style="font-size:15px;color:#555;line-height:1.7;">최근 3일간 해빛스쿨에 기록이 없었어요.<br>오늘 식단, 운동, 수면 기록 한 번만 해도 스트릭이 이어져요!</p>
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
    <p style="font-size:15px;color:#555;line-height:1.7;">7일 이상 기록이 없으셔서 바쁘게 보내고 계신 것 같아요.<br>오늘 다시 시작해도 전혀 늦지 않아요. 해빛스쿨이 응원합니다!</p>
    <div style="background:#f8f9ff;border-radius:12px;padding:16px;margin:20px 0;text-align:center;">
      <p style="margin:0;font-size:14px;color:#666;">다시 시작하면 <strong style="color:#1565c0;">복귀 보너스와 자신감</strong>이 기다려요 🙌</p>
    </div>
    <div style="text-align:center;margin:28px 0;">
      <a href="${appBaseUrl}" style="background:linear-gradient(135deg,#1565c0,#42a5f5);color:#fff;text-decoration:none;padding:14px 36px;border-radius:50px;font-size:16px;font-weight:600;display:inline-block;">해빛스쿨로 돌아가기</a>
    </div>
    <p style="font-size:13px;color:#aaa;text-align:center;">당신의 건강한 하루를 다시 만들 수 있어요 ✨</p>
  </div>
</div>`;

    return {
        days: Number(days),
        subject,
        summary,
        html,
        method: "gmail_nodemailer",
    };
}

module.exports = {
    buildReEngagementEmailTemplate,
};
