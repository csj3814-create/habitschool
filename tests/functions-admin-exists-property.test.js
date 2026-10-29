import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const FUNCTIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'functions');

// 웹 SDK 는 snap.exists(), 관리자 SDK 는 snap.exists (속성). 서버에서 exists() 를 부르면
// TypeError 다. notifyFriendsOnStreak 가 그렇게 2026-04-20 부터 10-29 까지 친구 연속 기록
// 알림을 하나도 보내지 못했다 — catch 가 경고만 남기고 삼켜서 아무도 몰랐다.
describe('Cloud Functions read snapshot.exists as a property', () => {
    const files = readdirSync(FUNCTIONS_DIR).filter((name) => name.endsWith('.js'));

    it('never calls exists() on an Admin SDK snapshot', () => {
        const offenders = files.flatMap((name) => readFileSync(resolve(FUNCTIONS_DIR, name), 'utf8')
            .split('\n')
            .map((line, i) => ({ line: line.trim(), where: `functions/${name}:${i + 1}` }))
            .filter(({ line }) => /\.exists\(\)/.test(line) && !line.startsWith('//'))
            .map(({ where }) => where));
        expect(offenders).toEqual([]);
    });
});
