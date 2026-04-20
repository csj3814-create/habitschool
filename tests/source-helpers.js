import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(TEST_DIR, '..');

export function readRepoFile(relativePath) {
    return readFileSync(resolve(ROOT_DIR, relativePath), 'utf8');
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
