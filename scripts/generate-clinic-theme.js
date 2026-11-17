// 병원 테마 스타일(styles-clinic-theme.css)을 만든다.
//
//   node scripts/generate-clinic-theme.js          만든다
//   node scripts/generate-clinic-theme.js --check  지금 파일이 최신인지 본다(tests/clinic-link.test.js 가 부른다)
//
// 2026-11-18 대표: "다른 오렌지 컬러도 병원 컬러에 맞추자." 앱의 주황은 스타일 파일 곳곳에 색 값으로
// 박혀 있다(250곳 남짓). 손으로 고르면 빠지는 곳이 생기고, 앞으로 주황을 새로 쓰면 또 빠진다.
// 그래서 주황을 쓰는 규칙마다 같은 선택자 앞에 html.clinic-theme 를 붙인 덮어쓰기 규칙을 만들고,
// 주황의 짙기에 맞춰 병원 색(--clinic-brand)의 짙고 옅은 단계로 바꾼다. 병원 QR 회원에게만 걸린다
// (js/clinic-link.js 가 <html> 에 clinic-theme 를 붙인다). 스타일 파일을 고치면 이 스크립트를 다시 돌린다.
//
// 주황인지는 색상(18°~43°)과 채도로 가린다. 노랑·금색(#FFC107, #FFD54F)은 별점·보상 같은 뜻이 있고,
// 빨강은 오류·경고라 바꾸지 않는다.

const fs = require('node:fs');
const path = require('node:path');
const postcss = require('postcss');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'styles-clinic-theme.css');
// index.html 이 읽는 순서대로. 뒤 파일이 앞 파일을 덮는 순서를 그대로 지킨다.
const SOURCES = [
    'styles-base.css',
    'styles-features.css',
    'styles-reward-market.css',
    'styles-dashboard.css',
    'styles-dark-mode.css',
    'styles-reports.css',
    'styles-en.css',
    'styles-guest-demo.css'
];
// 경고·오류 색은 병원 색으로 바꾸지 않는다. 경고가 차분한 병원 색이 되면 경고로 안 읽힌다.
const KEEP_PROPS = /^--(warning|error)/;

// 주황 → 병원 색 단계(밝기로 고른다)
const SHADES = {
    brand: 'var(--clinic-brand)',
    dark: 'var(--clinic-brand-dark)',
    soft: 'var(--clinic-brand-soft)',
    light: 'var(--clinic-brand-light)',
    pale: 'var(--clinic-brand-pale)',
    wash: 'var(--clinic-brand-wash)'
};
// 주황으로 보는 색상 범위(도). 18° 아래는 빨강(오류·경고), 43° 위는 노랑·금색(별점·보상)이라 둔다.
const ORANGE_HUE = [18, 43];
const MIN_SATURATION = 0.45;

const HEX_RE = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
const RGB_RE = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/g;

function toHsl(r, g, b) {
    const [R, G, B] = [r, g, b].map((v) => v / 255);
    const max = Math.max(R, G, B);
    const min = Math.min(R, G, B);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
    return { h, s, l };
}

/** 주황이면 병원 색 단계 이름, 아니면 null. */
function orangeShade(r, g, b) {
    const { h, s, l } = toHsl(r, g, b);
    if (s < MIN_SATURATION || h < ORANGE_HUE[0] || h > ORANGE_HUE[1]) return null;
    if (l < 0.42) return 'dark';
    if (l < 0.6) return 'brand';
    if (l < 0.72) return 'soft';
    if (l < 0.84) return 'light';
    if (l < 0.93) return 'pale';
    return 'wash';
}

function shadeValue(shade, alpha) {
    if (alpha >= 1) return SHADES[shade];
    return `color-mix(in srgb, ${SHADES[shade]} ${Math.round(alpha * 100)}%, transparent)`;
}

function mapValue(value) {
    let changed = false;
    let next = value.replace(HEX_RE, (match, hex) => {
        const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
        const n = parseInt(full, 16);
        const shade = orangeShade((n >> 16) & 255, (n >> 8) & 255, n & 255);
        if (!shade) return match;
        changed = true;
        return SHADES[shade];
    });
    next = next.replace(RGB_RE, (match, r, g, b, a) => {
        const shade = orangeShade(Number(r), Number(g), Number(b));
        if (!shade) return match;
        changed = true;
        return shadeValue(shade, a === undefined ? 1 : Number(a));
    });
    return changed ? next : null;
}

function scopeSelector(selector) {
    const s = selector.trim();
    if (/^:root\b/.test(s)) return s.replace(/^:root/, 'html.clinic-theme');
    if (/^html(?=[.\s:#[>~+]|$)/.test(s)) return s.replace(/^html/, 'html.clinic-theme');
    return `html.clinic-theme ${s}`;
}

function insideKeyframes(node) {
    for (let p = node.parent; p; p = p.parent) {
        if (p.type === 'atrule' && /keyframes$/i.test(p.name)) return true;
    }
    return false;
}

// 브라우저는 파일 끝에서 닫히지 않은 블록을 닫아 읽는다. 같은 방식으로 읽어야 덮어쓰기가 원래 규칙과
// 같은 @media 안에 놓인다. (2026-11-18 styles-dark-mode.css 1263행 @media (max-width: 480px) 가 닫히지 않았다.)
function parseLikeBrowser(css, file) {
    let source = css;
    for (let i = 0; i < 5; i += 1) {
        try {
            return postcss.parse(source, { from: file });
        } catch (error) {
            if (error?.reason !== 'Unclosed block') throw error;
            source += '\n}';
        }
    }
    return postcss.parse(source, { from: file });
}

function build() {
    const out = postcss.root();
    out.append(postcss.comment({ text: ' 자동 생성 — 손으로 고치지 말 것. scripts/generate-clinic-theme.js 가 만든다. ' }));
    out.append(postcss.rule({
        selector: 'html.clinic-theme',
        nodes: [
            postcss.decl({ prop: '--clinic-brand-dark', value: 'color-mix(in srgb, var(--clinic-brand) 78%, #000)' }),
            postcss.decl({ prop: '--clinic-brand-soft', value: 'color-mix(in srgb, var(--clinic-brand) 72%, #fff)' }),
            postcss.decl({ prop: '--clinic-brand-light', value: 'color-mix(in srgb, var(--clinic-brand) 45%, #fff)' }),
            postcss.decl({ prop: '--clinic-brand-pale', value: 'color-mix(in srgb, var(--clinic-brand) 22%, #fff)' }),
            postcss.decl({ prop: '--clinic-brand-wash', value: 'color-mix(in srgb, var(--clinic-brand) 9%, #fff)' })
        ]
    }));
    let ruleCount = 0;

    for (const file of SOURCES) {
        const css = fs.readFileSync(path.join(ROOT, file), 'utf8');
        const root = parseLikeBrowser(css, file);
        root.walkRules((rule) => {
            if (insideKeyframes(rule)) return;
            const decls = [];
            rule.each((node) => {
                if (node.type !== 'decl' || KEEP_PROPS.test(node.prop)) return;
                const mapped = mapValue(node.value);
                if (mapped) decls.push(postcss.decl({ prop: node.prop, value: mapped, important: node.important }));
            });
            if (!decls.length) return;
            const scoped = postcss.rule({ selector: rule.selectors.map(scopeSelector).join(',\n'), nodes: decls });
            // @media 같은 감싸개를 그대로 옮긴다.
            let node = scoped;
            for (let p = rule.parent; p && p.type === 'atrule'; p = p.parent) {
                node = postcss.atRule({ name: p.name, params: p.params, nodes: [node] });
            }
            out.append(postcss.comment({ text: ` ${file}:${rule.source.start.line} ` }));
            out.append(node);
            ruleCount += 1;
        });
    }
    return { css: `${out.toResult().css}\n`, ruleCount };
}

function main() {
    const { css, ruleCount } = build();
    if (process.argv.includes('--check')) {
        const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
        if (current !== css) {
            console.error('styles-clinic-theme.css 가 스타일 파일과 맞지 않습니다. node scripts/generate-clinic-theme.js 로 다시 만드세요.');
            process.exit(1);
        }
        console.log(`styles-clinic-theme.css 최신 (${ruleCount} 규칙)`);
    } else {
        fs.writeFileSync(OUT, css, 'utf8');
        console.log(`styles-clinic-theme.css ${ruleCount} 규칙, ${Buffer.byteLength(css)} bytes`);
    }
}

if (require.main === module) main();

module.exports = { mapValue, orangeShade, scopeSelector };
