// 쓰는 대문자 상수가 그 파일 안에 정의돼 있는지 본다.
// 2026-10-21 대표 제보: 오류 제보가 "MAX_MESSAGE_LENGTH is not defined" 로 실패했다. 2026-10-20(v525) 콘솔 기록 작업에서
// js/bug-report.js 의 상수 두 줄이 함께 지워졌는데 쓰는 곳은 남았다. 브라우저에서 그 줄에 닿기 전까지는 아무 신호가 없다.

import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseAst } from 'vite';
import { readRawRepoFile } from './source-helpers.js';
import { ROOT_DIR } from './korean-text-inventory.mjs';

const UPPER_SNAKE = /^[A-Z][A-Z0-9]*_[A-Z0-9_]+$/;

function collectPatternNames(pattern, names) {
    if (!pattern) return;
    if (pattern.type === 'Identifier') names.add(pattern.name);
    else if (pattern.type === 'ObjectPattern') pattern.properties.forEach((p) => collectPatternNames(p.type === 'RestElement' ? p.argument : p.value, names));
    else if (pattern.type === 'ArrayPattern') pattern.elements.forEach((e) => collectPatternNames(e, names));
    else if (pattern.type === 'AssignmentPattern') collectPatternNames(pattern.left, names);
    else if (pattern.type === 'RestElement') collectPatternNames(pattern.argument, names);
}

function findUndefinedConstants(source) {
    const declared = new Set();
    const used = new Set();
    const walk = (node, parent = null, key = '') => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.forEach((child) => walk(child, parent, key)); return; }
        if (typeof node.type !== 'string') return;
        if (node.type === 'VariableDeclarator') collectPatternNames(node.id, declared);
        if ((node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') && node.id) declared.add(node.id.name);
        if (node.type === 'ImportSpecifier' || node.type === 'ImportDefaultSpecifier' || node.type === 'ImportNamespaceSpecifier') declared.add(node.local.name);
        if (node.type === 'Identifier' && UPPER_SNAKE.test(node.name)) {
            const isPropertyName = (parent?.type === 'MemberExpression' && key === 'property' && !parent.computed)
                || (parent?.type === 'Property' && key === 'key' && !parent.computed)
                || (parent?.type === 'MethodDefinition' && key === 'key')
                || (parent?.type === 'ExportSpecifier' && key === 'exported');
            if (!isPropertyName) used.add(node.name);
        }
        for (const [childKey, child] of Object.entries(node)) {
            if (childKey === 'type' || childKey === 'start' || childKey === 'end') continue;
            if (child && typeof child === 'object') walk(child, node, childKey);
        }
    };
    walk(parseAst(source));
    return [...used].filter((name) => !declared.has(name)).sort();
}

describe('js 파일은 쓰는 대문자 상수를 모두 정의하거나 가져온다', () => {
    const files = readdirSync(join(ROOT_DIR, 'js')).filter((name) => name.endsWith('.js'));
    it.each(files)('%s', (name) => {
        expect(findUndefinedConstants(readRawRepoFile(`js/${name}`))).toEqual([]);
    });

    const serverFiles = readdirSync(join(ROOT_DIR, 'functions')).filter((name) => name.endsWith('.js'));
    it.each(serverFiles)('functions/%s', (name) => {
        expect(findUndefinedConstants(readRawRepoFile(`functions/${name}`))).toEqual([]);
    });

    it('이 검사는 지워진 상수를 잡는다', () => {
        expect(findUndefinedConstants('const A_B = 1;\nfunction f() { return A_B + MAX_MESSAGE_LENGTH; }')).toEqual(['MAX_MESSAGE_LENGTH']);
    });
});
