import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(resolve(ROOT_DIR, 'js/app-core.js'), 'utf8');
const DATA_MANAGER = readFileSync(resolve(ROOT_DIR, 'js/data-manager.js'), 'utf8');

// 2026-09-29: 운영 daily_logs 의 timestamp 가 하루 11~16건 중 1~3건만 진짜 시각이었고,
// 나머지는 {_methodName: 'serverTimestamp'} 라는 지도 값이었다. 저장 버튼의 saveData 가
// sanitize(JSON 왕복) 안에서 serverTimestamp() 를 만들었기 때문이다.
const sanitizeBody = DATA_MANAGER.split('export function sanitize(obj) {')[1].split('\n}\n')[0];
const sanitize = new Function('obj', sanitizeBody);

class FakeServerTimestamp {
    constructor() { this._methodName = 'serverTimestamp'; }
}

describe('the save button stamps a real server time', () => {
    it('sanitize turns a field-value sentinel into a plain map (why the order matters)', () => {
        const out = sanitize({ timestamp: new FakeServerTimestamp() });
        expect(out.timestamp).toEqual({ _methodName: 'serverTimestamp' });
        expect(out.timestamp).not.toBeInstanceOf(FakeServerTimestamp);
    });

    it('builds saveData without the sentinel and attaches it after sanitize', () => {
        const block = APP.split('const saveData = sanitize({')[1].split('latestSaveData = saveData;')[0];
        const inside = block.split('\n            });')[0];
        expect(inside).not.toContain('serverTimestamp()');
        expect(block).toContain('saveData.timestamp = serverTimestamp();');
    });
});
