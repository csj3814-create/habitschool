const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_PATH = path.join(ROOT, 'index.html');
const OUT_DIR = path.join(ROOT, 'en');
const OUT_PATH = path.join(OUT_DIR, 'index.html');

const EN_TITLE = 'Habit School - Better habits, one day at a time';
const EN_DESCRIPTION = 'Record food, exercise, sleep, meditation, and gratitude with Habit School. Start with one small habit today.';
const EN_KEYWORDS = 'Habit School, habits, food log, exercise log, sleep log, meditation, gratitude, health app';
const EN_URL = 'https://habitschool.web.app/en';
const KO_URL = 'https://habitschool.web.app/';
const EN_IMAGE = 'https://habitschool.web.app/icons/og-image-en.png';

function replaceRequired(source, pattern, replacement, label) {
    if (!pattern.test(source)) {
        throw new Error(`Could not find ${label} while generating en/index.html`);
    }
    return source.replace(pattern, replacement);
}

function buildJsonLd() {
    return JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'Habit School',
        alternateName: '해빛스쿨',
        description: EN_DESCRIPTION,
        url: EN_URL,
        applicationCategory: 'HealthApplication',
        operatingSystem: 'Web',
        offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: 'USD'
        },
        image: 'https://habitschool.web.app/icons/app-icon-512.png',
        screenshot: EN_IMAGE,
        inLanguage: 'en',
        author: {
            '@type': 'Organization',
            name: 'Habit School',
            url: KO_URL
        },
        keywords: EN_KEYWORDS
    }, null, 8).replace(/^/gm, '    ');
}

// ── 빌드할 때 영어 글자 넣기 (해외 3단계 E0, 2026-10-21) ──────────────────────────
// data-i18n 이 달린 요소는 원래 앱이 뜬 뒤 js/i18n.js 가 영어로 바꿔 끼웠다. 그동안 화면을 숨겨 두어야 했다
// (html.locale-loading). 같은 바꿔 끼우기를 여기서 미리 해 두면 영어 화면은 처음부터 영어로 온다.
// 한국어 index.html 은 건드리지 않는다. 앱의 바꿔 끼우기도 그대로 돈다(같은 값이라 아무것도 바뀌지 않는다).

const EN_MESSAGES_PATH = path.join(ROOT, 'js', 'i18n-en.js');
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

// 사전 파일은 브라우저용 ES 모듈이다. 값만 든 객체 하나라 export 만 떼고 읽는다.
function loadEnglishMessages(source = fs.readFileSync(EN_MESSAGES_PATH, 'utf8')) {
    const marker = /^export const EN_MESSAGES = /m;
    if (!marker.test(source)) throw new Error('js/i18n-en.js must start its table with "export const EN_MESSAGES = "');
    const sandbox = {};
    vm.runInNewContext(source.replace(marker, 'EN_MESSAGES = '), sandbox);
    return sandbox.EN_MESSAGES;
}

// 앱의 t(key) 와 같은 결과: 자리표시는 값이 없으면 빈칸이 된다.
function englishValue(messages, key) {
    const value = messages[key];
    if (!value) throw new Error(`index.html uses data-i18n key "${key}" that js/i18n-en.js does not have`);
    return String(value).replace(/\{(\w+)\}/g, '');
}

function escapeText(value) {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(value) {
    return escapeText(value).replace(/"/g, '&quot;');
}

function setAttribute(tag, name, value) {
    const pattern = new RegExp(`(\\s${name}=")[^"]*(")`);
    const escaped = escapeAttr(value);
    if (pattern.test(tag)) return tag.replace(pattern, (_, open, close) => `${open}${escaped}${close}`);
    return tag.replace(/\s*(\/?)>$/, (_, slash) => ` ${name}="${escaped}"${slash ? ' /' : ''}>`);
}

// 여는 태그 바로 뒤부터, 같은 이름 태그의 짝이 맞는 닫는 태그 앞까지.
function findElementEnd(html, tagName, contentStart) {
    const pattern = new RegExp(`<(/?)${tagName}\\b[^>]*>`, 'gi');
    pattern.lastIndex = contentStart;
    let depth = 1;
    let match;
    while ((match = pattern.exec(html))) {
        depth += match[1] ? -1 : 1;
        if (depth === 0) return { contentEnd: match.index, closeEnd: match.index + match[0].length };
    }
    throw new Error(`no closing </${tagName}> after offset ${contentStart}`);
}

function translateI18nAttributes(source, messages) {
    const scriptRanges = [];
    for (const match of source.matchAll(/<script\b[\s\S]*?<\/script>|<!--[\s\S]*?-->/gi)) {
        scriptRanges.push([match.index, match.index + match[0].length]);
    }
    const inSkippedRange = (index) => scriptRanges.some(([start, end]) => index >= start && index < end);

    let out = '';
    let cursor = 0;
    // data-i18n-initial: 코드가 나중에 글자를 바꾸는 칸(id 가 있는 상태 문구 등)의 처음 글자. 빌드 때만 바꾸고 앱은 손대지 않는다 —
    // data-i18n 이면 화면 감시가 코드가 쓴 글자를 다시 덮어쓴다.
    const tagPattern = /<([a-zA-Z][\w-]*)\b[^>]*\sdata-i18n(?:-html|-placeholder|-aria-label|-initial)?="[^"]*"[^>]*>/g;
    let match;
    while ((match = tagPattern.exec(source))) {
        if (match.index < cursor || inSkippedRange(match.index)) continue;
        const tagName = match[1].toLowerCase();
        let tag = match[0];
        const attr = (name) => (tag.match(new RegExp(`\\s${name}="([^"]*)"`)) || [])[1];

        const placeholderKey = attr('data-i18n-placeholder');
        if (placeholderKey) tag = setAttribute(tag, 'placeholder', englishValue(messages, placeholderKey));
        const ariaKey = attr('data-i18n-aria-label');
        if (ariaKey) tag = setAttribute(tag, 'aria-label', englishValue(messages, ariaKey));

        const textKey = attr('data-i18n') || attr('data-i18n-initial');
        const htmlKey = attr('data-i18n-html');
        const contentStart = match.index + match[0].length;
        out += source.slice(cursor, match.index) + tag;
        cursor = contentStart;

        if ((textKey || htmlKey) && !VOID_TAGS.has(tagName)) {
            const { contentEnd } = findElementEnd(source, tagName, contentStart);
            out += htmlKey ? englishValue(messages, htmlKey) : escapeText(englishValue(messages, textKey));
            cursor = contentEnd;
            tagPattern.lastIndex = contentEnd;
        }
    }
    return out + source.slice(cursor);
}

function generate(source, messages = loadEnglishMessages()) {
    let html = translateI18nAttributes(source, messages);

    html = html.replace('<!DOCTYPE html>', '<!DOCTYPE html>\n<!-- Generated by scripts/generate-en-entry.js. Do not edit this file by hand. -->');
    html = replaceRequired(html, /<html lang="[^"]*">/, '<html lang="en">', 'html lang');
    html = replaceRequired(html, /(<meta charset="UTF-8">\s*)/, '$1    <base href="/">\n', 'meta charset');
    html = replaceRequired(html, /<title>[\s\S]*?<\/title>/, `<title>${EN_TITLE}</title>`, 'title');
    html = replaceRequired(html, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${EN_DESCRIPTION}">`, 'description');
    html = replaceRequired(html, /<meta name="keywords" content="[^"]*">/, `<meta name="keywords" content="${EN_KEYWORDS}">`, 'keywords');
    html = replaceRequired(html, /<meta name="author" content="[^"]*">/, '<meta name="author" content="Habit School">', 'author');
    html = replaceRequired(html, /<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${EN_URL}">`, 'canonical');
    html = replaceRequired(html, /<link rel="alternate" hreflang="ko" href="[^"]*">/, `<link rel="alternate" hreflang="ko" href="${KO_URL}">`, 'ko hreflang');
    html = replaceRequired(html, /<link rel="alternate" hreflang="en" href="[^"]*">/, `<link rel="alternate" hreflang="en" href="${EN_URL}">`, 'en hreflang');
    html = replaceRequired(html, /<link rel="alternate" hreflang="x-default" href="[^"]*">/, `<link rel="alternate" hreflang="x-default" href="${KO_URL}">`, 'x-default hreflang');

    const metaReplacements = [
        [/content="해빛스쿨 - 즐겁게 좋은 습관 만들기"/g, `content="${EN_TITLE}"`],
        [/content="매일 식단, 운동, 수면을 기록하고 포인트를 모으는 건강 습관 앱[^"]*"/g, `content="${EN_DESCRIPTION}"`],
        [/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${EN_IMAGE}">`],
        [/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${EN_URL}">`],
        [/<meta property="og:site_name" content="[^"]*">/, '<meta property="og:site_name" content="Habit School">'],
        [/<meta property="og:locale" content="[^"]*">/, '<meta property="og:locale" content="en_US">'],
        [/<meta name="twitter:image" content="[^"]*">/, `<meta name="twitter:image" content="${EN_IMAGE}">`],
        [/<link rel="manifest" href="[^"]*">/, '<link rel="manifest" href="/manifest-en.json">'],
        [/<meta name="apple-mobile-web-app-title" content="[^"]*">/, '<meta name="apple-mobile-web-app-title" content="Habit School">']
    ];
    for (const [pattern, replacement] of metaReplacements) {
        html = replaceRequired(html, pattern, replacement, String(pattern));
    }

    html = replaceRequired(
        html,
        /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
        `<script type="application/ld+json">\n${buildJsonLd()}\n    </script>`,
        'JSON-LD'
    );

    return html;
}

function main() {
    const source = fs.readFileSync(SOURCE_PATH, 'utf8');
    const generated = generate(source);

    if (process.argv.includes('--check')) {
        const existing = fs.existsSync(OUT_PATH) ? fs.readFileSync(OUT_PATH, 'utf8') : '';
        if (existing !== generated) {
            console.error('en/index.html is out of sync. Run: node scripts/generate-en-entry.js');
            process.exit(1);
        }
        return;
    }

    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(OUT_PATH, generated, 'utf8');
}

if (require.main === module) {
    main();
}

module.exports = { generate, loadEnglishMessages, translateI18nAttributes };
