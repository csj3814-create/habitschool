// 병원별 안내 페이지와 시작 링크를 만든다 (카톡 미리보기가 병원 이름으로 뜨게).
//
//   node scripts/generate-clinic-pages.js          만든다
//   node scripts/generate-clinic-pages.js --check  지금 파일이 최신인지 본다(tests/clinic-pages.test.js 가 부른다)
//
// 2026-11-20 대표: "카톡에 보낼 때 병원에서 보낸 것처럼 OG 설정해 줘. 앱 주소도 마찬가지."
// 카톡은 자바스크립트를 돌리지 않고 HTML 의 og: 태그만 읽는다. 그래서 병원마다 파일을 따로 둔다.
//   clinic/<병원>.html      → /clinic/<병원>      안내 페이지(clinic.html 에 OG 를 넣은 것)
//   clinic/<병원>/app.html  → /clinic/<병원>/app  병원 미리보기로 뜨고, 열면 곧바로 /app?clinic=<병원>
// /app?clinic=<병원> 자체는 모든 회원이 여는 index.html 이라 병원별 미리보기를 줄 수 없다.
// 미리보기 그림은 assets/clinics/<병원>-og.png (habitschool-private/clinic-pilot-print/6_og.html 로 뽑는다).

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'https://habitschool.web.app';
const MARKER = '<!-- CLINIC_OG -->';

// 운영 Firestore clinics/{id} 의 이름과 같게.
const CLINICS = [
    { id: 'joseph', name: '요셉의원' },
    { id: 'chamsarang', name: '참사랑내과의원' }
];

const escapeHtml = (s) => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function ogTags({ title, description, url, clinic }) {
    const t = escapeHtml(title);
    const d = escapeHtml(description);
    return [
        `<meta property="og:type" content="website">`,
        `<meta property="og:site_name" content="${escapeHtml(clinic.name)}">`,
        `<meta property="og:title" content="${t}">`,
        `<meta property="og:description" content="${d}">`,
        `<meta property="og:image" content="${ORIGIN}/assets/clinics/${clinic.id}-og.png">`,
        `<meta property="og:image:width" content="1200">`,
        `<meta property="og:image:height" content="630">`,
        `<meta property="og:url" content="${url}">`,
        `<meta property="og:locale" content="ko_KR">`,
        `<meta name="twitter:card" content="summary_large_image">`,
        `<meta name="twitter:title" content="${t}">`,
        `<meta name="twitter:description" content="${d}">`,
        `<meta name="twitter:image" content="${ORIGIN}/assets/clinics/${clinic.id}-og.png">`
    ].map((line) => `    ${line}`).join('\n');
}

const GENERATED = '<!-- 이 파일은 scripts/generate-clinic-pages.js 가 만든다. 직접 고치지 말 것. -->';

function renderGuidePage(template, clinic) {
    const title = `${clinic.name} 건강수첩 안내`;
    const og = ogTags({
        title,
        description: '집에서 잰 혈압·혈당을 휴대폰에 적어 두고 진료 때 보여 주세요. 앱은 무료이고, 기록은 병원으로 보내지 않아요.',
        url: `${ORIGIN}/clinic/${clinic.id}`,
        clinic
    });
    return template
        .replace('<!DOCTYPE html>', `<!DOCTYPE html>\n${GENERATED}`)
        .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)} - 해빛스쿨</title>`)
        .replace(`    ${MARKER}`, og);
}

function renderStartPage(clinic) {
    const target = `/app?clinic=${clinic.id}`;
    const title = `${clinic.name} 건강수첩`;
    return `<!DOCTYPE html>
${GENERATED}
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <link rel="icon" href="/icons/app-icon-192.png">
${ogTags({
        title,
        description: '눌러서 바로 시작하세요. 아침에 잰 혈압·혈당과 식사를 적어 두고 진료 때 보여 주세요. 앱은 무료예요.',
        url: `${ORIGIN}/clinic/${clinic.id}/app`,
        clinic
    })}
    <style>body { font-family: -apple-system, BlinkMacSystemFont, 'Malgun Gothic', sans-serif; text-align: center; padding-top: 30vh; color: #333; } a { color: #E65100; font-weight: 700; }</style>
    <!-- 카톡은 미리보기만 읽고, 사람이 열면 곧바로 병원 가입 화면으로 간다. 같은 사이트의 앱으로(스테이징은 스테이징 앱). -->
    <script>location.replace(${JSON.stringify(target)});</script>
</head>
<body>
    <p><a href="${target}">${escapeHtml(title)} 열기</a></p>
</body>
</html>
`;
}

function renderAll() {
    const template = fs.readFileSync(path.join(ROOT, 'clinic.html'), 'utf8').replace(/\r\n/g, '\n');
    if (!template.includes(MARKER)) throw new Error(`clinic.html 에 ${MARKER} 가 없다`);
    const files = {};
    for (const clinic of CLINICS) {
        files[`clinic/${clinic.id}.html`] = renderGuidePage(template, clinic);
        files[`clinic/${clinic.id}/app.html`] = renderStartPage(clinic);
    }
    return files;
}

module.exports = { CLINICS, renderAll };

if (require.main === module) {
    const files = renderAll();
    const check = process.argv.includes('--check');
    const stale = [];
    for (const [rel, content] of Object.entries(files)) {
        const full = path.join(ROOT, rel);
        const current = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
        if (current === content) continue;
        if (check) { stale.push(rel); continue; }
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content);
        console.log('wrote', rel);
    }
    if (check && stale.length) {
        console.error(`최신이 아니다: ${stale.join(', ')} — node scripts/generate-clinic-pages.js`);
        process.exit(1);
    }
}
