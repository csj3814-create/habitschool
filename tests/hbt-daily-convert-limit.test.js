import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');

// 2026-09-13 제보: "오늘 변환 한도가 제대로 표시되지 않는 것 같아. 하루 2만까지 최대 아닌가?"
// 두 가지가 섞여 있었다. 2만은 컨트랙트의 지갑당 발행 상한(챌린지 보너스 포함)이고,
// 변환에 걸리는 것은 서버의 MAX_DAILY_HBT = 12,000 이다. 그건 화면이 맞았다.
// 진짜 문제는 앞자리가 '남은 양'이라 `0 / 12,000` 이 "12,000 중 0을 썼다" 로 읽혔다는 것.
describe('the daily conversion limit reads the way the server states it', () => {
    const app = read('js/app-core.js');
    const runtime = read('functions/runtime.js');

    it('client and server hold the same number', () => {
        const server = runtime.match(/const MAX_DAILY_HBT = (\d+);/);
        const client = app.match(/const HBT_DAILY_CONVERT_LIMIT = (\d+);/);
        expect(server).toBeTruthy();
        expect(client).toBeTruthy();
        // 화면이 더 크게 말하면 눌러 본 뒤에야 거절당한다.
        expect(client[1]).toBe(server[1]);
    });

    it('shows what was used, not what is left', () => {
        const block = app.split("const dailyMax = HBT_DAILY_CONVERT_LIMIT;")[1].split('\n\n')[0];
        expect(block).toContain('const usedHbt =');
        expect(block).toContain('${usedHbt.toLocaleString()} / ${dailyMax.toLocaleString()} HBT');
        // 앞자리에 remainingHbt 를 다시 쓰면 같은 오해가 돌아온다.
        expect(block).not.toContain('${mintWindowUsage.remainingHbt.toLocaleString()} / ');
    });

    it('says plainly when the day is used up', () => {
        const block = app.split("const dailyMax = HBT_DAILY_CONVERT_LIMIT;")[1].split('\n\n')[0];
        expect(block).toContain('오늘 한도를 다 썼어요');
        expect(block).toContain("classList.toggle('is-exhausted'");
        expect(read('styles-features.css')).toContain('.wallet-convert-limit.is-exhausted');
    });

    it('counts only conversions, the same scope the server limits', () => {
        const fn = app.split('function summarizeMintWindowUsage(')[1].split('\n}\n')[0];
        expect(fn).toContain("if (tx.type === 'conversion')");
        expect(fn).toContain('convertedHbt += amount;');
        // 챌린지 정산은 총획득에만 더한다. 변환 한도에 섞이면 안 된다.
        expect(fn).toContain("if (tx.type === 'challenge_settlement')");
        expect(fn).toContain('totalEarnedHbt += Number(tx.amount || 0);');
    });

    it('the static placeholder starts from zero used', () => {
        expect(read('index.html')).toContain('오늘 변환 한도: <strong>0 / 12,000 HBT</strong>');
    });
});
