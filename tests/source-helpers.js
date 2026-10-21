import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(TEST_DIR, '..');

function readRaw(relativePath) {
    return readFileSync(resolve(ROOT_DIR, relativePath), 'utf8');
}

// ── 한국어 문구가 사전으로 옮겨 간 뒤에도 "그 화면에 그 한국어가 나온다" 를 볼 수 있게 ──────────
// 해외 3단계(2026-10-21~)에서 코드의 한국어 문장을 js/i18n-ko.js 로 글자 그대로 옮기고 그 자리에 t('키') 를 둔다.
// 코드 문자열을 찾는 테스트가 많아서, js/ 파일을 읽을 때 t('키') 를 한국어 값으로 펼쳐 돌려준다.
// t('키') 자체를 찾아야 하는 테스트는 readRawRepoFile 을 쓴다.
let koMessages = null;
function loadKoreanMessages() {
    if (koMessages) return koMessages;
    const source = readRaw('js/i18n-ko.js').replace(/^export const KO_MESSAGES = /m, 'KO_MESSAGES = ');
    const sandbox = {};
    vm.runInNewContext(source, sandbox);
    koMessages = sandbox.KO_MESSAGES;
    return koMessages;
}

function quote(value) {
    return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

export function expandKoreanMessages(source) {
    const messages = loadKoreanMessages();
    // t('키') 는 옮기기 전 글과 똑같이 '한국어' 가 된다. 값을 넘기는 t('키', {…}) 는 t('한국어', {…}) 로 —
    // 코드를 실제로 돌려 보는 테스트(Function(...))도 문법이 깨지지 않게.
    return source
        .replace(/\bt\('([\w.]+)'\)/g, (match, key) => (key in messages ? quote(messages[key]) : match))
        .replace(/\bt\('([\w.]+)'/g, (match, key) => (key in messages ? `t(${quote(messages[key])}` : match));
}

export function readRepoFile(relativePath) {
    const raw = readRaw(relativePath);
    const normalized = relativePath.replace(/\\/g, '/');
    if (!/^js\/.+\.js$/.test(normalized) || /^js\/i18n(-\w+)?\.js$/.test(normalized)) return raw;
    return expandKoreanMessages(raw);
}

export function readRawRepoFile(relativePath) {
    return readRaw(relativePath);
}

export function readAppSource({ includeEntrypoint = false } = {}) {
    const coreSource = readRepoFile('js/app-core.js');
    if (!includeEntrypoint) return coreSource;
    return `${readRepoFile('js/app.js')}\n${coreSource}`;
}

export function readFunctionsSource({ includeEntrypoint = false } = {}) {
    const runtimeSource = readRepoFile('functions/runtime.js');
    if (!includeEntrypoint) return runtimeSource;
    return `${readRepoFile('functions/index.js')}\n${runtimeSource}`;
}

// 번역 사전은 해외 3단계(2026-10-21)에서 언어별 파일로 나뉘었다. 문구를 찾는 테스트는 셋을 함께 읽는다.
export function readI18nSource() {
    return ['js/i18n.js', 'js/i18n-ko.js', 'js/i18n-en.js'].map(readRaw).join('\n');
}
