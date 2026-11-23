import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 2026-11-24 대표: 해빛 배지 「펼치기」 뒤 4초쯤 빈 카드. 기다리는 표시를 붙이고, 함수는 자기 파일만 읽고 시작한다.
describe('해빛 배지 펼치기', () => {
    it('펼치자마자 불러오는 중을 보인다', () => {
        const card = readRepoFile('js/global-rewards.js');
        expect(card).toContain("copy('배지를 불러오는 중…', 'Loading badges…')");
        expect(card).toContain('const loading = collapse.badge');
    });

    it('배지 함수는 runtime.js 없이 빨리 깨어난다', () => {
        const index = readRepoFile('functions/index.js');
        expect(index).toContain('getGlobalRewardSnapshot: "./global-reward-snapshot"');
        expect(index).toContain('getGlobalRewardSnapshot,');
        expect(readRepoFile('functions/runtime.js')).not.toContain('exports.getGlobalRewardSnapshot');
        const fn = readRepoFile('functions/global-reward-snapshot.js');
        expect(fn).not.toContain('require("./runtime")');
        expect(fn).toContain('buildGlobalRewardSnapshot({ db, uid, userData');
    });
});
