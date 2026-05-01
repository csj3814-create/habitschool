import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(TEST_DIR, '..');

const ROOT_RUNTIME_FILES = [
    'index.html',
    'admin.html',
    'changelog.html',
    'privacy.html',
    'terms.html',
    'tokenomics.html',
    'community-history.html',
    'manifest.json',
    'sw.js',
    'firebase-messaging-sw.js'
];

const MOJIBAKE_PATTERN = /\uFFFD|[\uF900-\uFAFF]|[\u8AED\u7B4C\u91AB\u75AB\u6C83\u8881\u8E42\u745C\u6FE1\u7337]|\?[\u3131-\u318E\uAC00-\uD7A3]/u;
const BROKEN_CSS_CONTENT_PATTERN = /content:\s*"[^"]*\?{2,}[^"]*";/;

function readRepoFile(relativePath) {
    return readFileSync(resolve(ROOT_DIR, relativePath), 'utf8');
}

function stripJsComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function stripCssComments(source) {
    return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

function normalizeRuntimeSource(relativePath, source) {
    if (relativePath.endsWith('.js')) return stripJsComments(source);
    if (relativePath.endsWith('.css')) return stripCssComments(source);
    return source;
}

function collectRuntimeFiles() {
    const jsFiles = readdirSync(resolve(ROOT_DIR, 'js'), { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
        .map((entry) => join('js', entry.name));

    const cssFiles = readdirSync(ROOT_DIR)
        .filter((name) => /^styles.*\.css$/.test(name));

    return [...ROOT_RUNTIME_FILES, ...jsFiles, ...cssFiles]
        .filter((relativePath) => existsSync(resolve(ROOT_DIR, relativePath)));
}

describe('Korean text integrity', () => {
    it('keeps runtime UI and console text free of mojibake', () => {
        const hits = [];

        for (const relativePath of collectRuntimeFiles()) {
            const source = normalizeRuntimeSource(relativePath, readRepoFile(relativePath));
            source.split(/\r?\n/).forEach((line, index) => {
                if (
                    MOJIBAKE_PATTERN.test(line) ||
                    (relativePath.endsWith('.css') && BROKEN_CSS_CONTENT_PATTERN.test(line))
                ) {
                    hits.push(`${relativePath}:${index + 1}: ${line.trim()}`);
                }
            });
        }

        expect(hits).toEqual([]);
    });
});
