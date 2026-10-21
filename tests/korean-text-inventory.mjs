// 한국어 앱이 회원에게 보여 주는 글자를 모은다.
// tests/korean-app-unchanged-i18n.test.js 가 이것을 기준 파일(tests/fixtures/korean-text-baseline.json)과 비교하고,
// scripts/snapshot-korean-text.mjs 가 기준 파일을 만든다. 둘이 같은 함수를 써야 비교가 맞는다.
//
// 영어 앱을 키 기반 번역으로 옮기는 동안(해외 3단계, 2026-10-21~) 한국어 문장은 코드에서 사전(js/i18n/ko.js)으로
// 자리만 옮긴다. 그래서 "어느 파일에 있나" 는 보지 않고 "그 문장이 아직 어딘가에 그대로 있나" 를 본다.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAst } from 'vite';

export const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HANGUL = /[가-힣]/;
const KOREAN_ATTRS = ['aria-label', 'placeholder', 'title', 'alt', 'content', 'value', 'label'];

function collapse(text) {
    return String(text).replace(/\s+/g, ' ').trim();
}

function decodeEntities(text) {
    return String(text)
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&times;/g, '×')
        .replace(/&middot;/g, '·')
        .replace(/&amp;/g, '&');
}

/**
 * HTML 에서 한글이 든 글자 조각을 나오는 순서대로 뽑는다.
 * 텍스트 노드와 회원에게 보이는 속성(aria-label·placeholder·title·alt·content·value·label)만 본다.
 * <script>·<style>·주석은 뺀다. 속성이 늘어나는 것(data-i18n 등)은 결과에 영향이 없다.
 */
export function extractHtmlKoreanText(html) {
    const source = String(html)
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[\s\S]*?<\/style>/gi, ' ');
    const out = [];
    const tagPattern = /<[^>]*>/g;
    let last = 0;
    let match;
    while ((match = tagPattern.exec(source))) {
        const text = collapse(decodeEntities(source.slice(last, match.index)));
        if (text && HANGUL.test(text)) out.push(text);
        const tag = match[0];
        for (const attr of KOREAN_ATTRS) {
            const attrPattern = new RegExp(`\\s${attr}="([^"]*)"`, 'g');
            let attrMatch;
            while ((attrMatch = attrPattern.exec(tag))) {
                const value = collapse(decodeEntities(attrMatch[1]));
                if (value && HANGUL.test(value)) out.push(`@${attr}=${value}`);
            }
        }
        last = match.index + tag.length;
    }
    const tail = collapse(decodeEntities(source.slice(last)));
    if (tail && HANGUL.test(tail)) out.push(tail);
    return out;
}

// 사전 값('{days}일 연속')과 템플릿 리터럴(`${days}일 연속`)이 같은 조각으로 나오게 자리표시를 끊는다.
// 코드 문자열 안의 HTML 태그(`<img src="…">해빛스쿨 체험`)도 끊는다. 보는 것은 글자이지 그림 경로·속성이 아니다.
// 조각 끝의 문장부호·따옴표도 뗀다. 코드에서 `…. 입력하러 가기"` 였던 것이 사전에서는 `입력하러 가기` 가 된다.
export function normalizePiece(piece) {
    let text = collapse(piece);
    // `${…}` 가 태그 가운데를 자르면 조각 앞에 태그 꼬리(`false)">거절`), 뒤에 태그 머리(`거절<button onclick="`)가 붙는다.
    const close = text.lastIndexOf('>');
    if (close > -1 && text.lastIndexOf('<', close) === -1) text = text.slice(close + 1);
    const open = text.indexOf('<');
    if (open > -1 && text.indexOf('>', open) === -1) text = text.slice(0, open);
    return text.replace(/^[\s.,:;!?"'`()\[\]·—–\-/]+|[\s.,:;!?"'`()\[\]·—–\-/]+$/g, '');
}

function splitPieces(value) {
    return String(value)
        .split(/\{\w+\}|<[^<>]*>/)
        .map(normalizePiece)
        .filter((piece) => piece && HANGUL.test(piece));
}

/** JS 소스의 문자열·템플릿 조각 중 한글이 든 것. 주석은 파서가 버린다. */
export function extractJsKoreanPieces(source, file = '') {
    let ast;
    try {
        ast = parseAst(source);
    } catch (error) {
        throw new Error(`${file}: ${error.message}`);
    }
    const pieces = [];
    const walk = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
            node.forEach(walk);
            return;
        }
        if (node.type === 'Literal' && typeof node.value === 'string') {
            pieces.push(...splitPieces(node.value));
        } else if (node.type === 'TemplateElement') {
            pieces.push(...splitPieces(node.value?.cooked ?? node.value?.raw ?? ''));
        }
        for (const key of Object.keys(node)) {
            if (key !== 'type' && key !== 'start' && key !== 'end') walk(node[key]);
        }
    };
    walk(ast);
    return pieces;
}

function listJsFiles(dir) {
    const abs = join(ROOT_DIR, dir);
    const out = [];
    for (const name of readdirSync(abs)) {
        if (name === 'node_modules') continue;
        const full = join(abs, name);
        if (statSync(full).isDirectory()) out.push(...listJsFiles(relative(ROOT_DIR, full)));
        else if (/\.(m?js)$/.test(name)) out.push(relative(ROOT_DIR, full).replace(/\\/g, '/'));
    }
    return out.sort();
}

/** js/ 아래(사전 포함) 또는 functions/ 아래의 한국어 조각 집합. */
export function collectKoreanPieceSet(dir) {
    const set = new Set();
    for (const file of listJsFiles(dir)) {
        const source = readFileSync(join(ROOT_DIR, file), 'utf8');
        extractJsKoreanPieces(source, file).forEach((piece) => set.add(piece));
    }
    return set;
}

export function buildKoreanTextInventory() {
    return {
        indexHtml: extractHtmlKoreanText(readFileSync(join(ROOT_DIR, 'index.html'), 'utf8')),
        js: [...collectKoreanPieceSet('js')].sort(),
        functions: [...collectKoreanPieceSet('functions')].sort(),
    };
}
