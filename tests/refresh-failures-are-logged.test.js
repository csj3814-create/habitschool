import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const JS_DIR = join(ROOT_DIR, 'js');
const FILES = readdirSync(JS_DIR).filter((f) => f.endsWith('.js'));

// 화면을 다시 그리거나 다시 읽는 성격의 이름.
const REFRESH_CALL = /\b((?:render|refresh|load|update|sync|redraw|reload|apply)[A-Z]\w*)\s*\([^;]*?\)\s*\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/g;

// 2026-09-16 제보: "챌린지 완료 직후에는 정산 확인중 뜨고 앱을 나갔다 들어와야
// 정산 가능하게 바뀌네."
//
// 서버 쓰기는 성공했는데 뒤이은 화면 갱신이 조용히 실패했다. 회원에게는 "안 된
// 것" 으로 보이고, 버그 제보를 열어도 콘솔이 비어 있어 볼 것이 없었다.
// 그 모양이 js/ 안에 46곳 있었다.
describe('a refresh that fails leaves a trace', () => {
    it('has no silent catch on a render/refresh/load call', () => {
        const offenders = [];
        for (const file of FILES) {
            const lines = readFileSync(join(JS_DIR, file), 'utf8').split('\n');
            lines.forEach((line, i) => {
                for (const m of line.matchAll(REFRESH_CALL)) {
                    offenders.push(`${file}:${i + 1}  ${m[1]}(...).catch(() => {})`);
                }
            });
        }
        expect(
            offenders,
            offenders.length
                ? '화면 갱신 실패를 삼키고 있다. onRefreshFailure(\'무엇\') 를 쓰라:\n  ' + offenders.join('\n  ')
                : ''
        ).toEqual([]);
    });

    it('offers one handler both files can share', () => {
        const helpers = readFileSync(join(JS_DIR, 'ui-helpers.js'), 'utf8');
        expect(helpers).toContain('export function onRefreshFailure(what');
        expect(helpers).toContain("console.warn(`[화면 갱신] ${what} 실패:`");
    });

    it('names what failed, so the log is worth reading', () => {
        // onRefreshFailure() 를 이름표 없이 부르면 전부 '화면' 이 되어 쓸모가 없다.
        const bare = [];
        for (const file of FILES) {
            const lines = readFileSync(join(JS_DIR, file), 'utf8').split('\n');
            lines.forEach((line, i) => {
                if (/onRefreshFailure\(\s*\)/.test(line)) bare.push(`${file}:${i + 1}`);
            });
        }
        expect(bare).toEqual([]);
    });

    it('is actually used where the reported bug was', () => {
        const app = readFileSync(join(JS_DIR, 'app-core.js'), 'utf8');
        expect(app).toContain("renderSocialChallenges(user).catch(onRefreshFailure('소셜 챌린지'))");
        expect(app).toContain("loadGalleryData().catch(onRefreshFailure('갤러리'))");
    });

    it('leaves the harmless silent catches alone', () => {
        // 이 규칙은 '화면 갱신' 에만 건다. localStorage 나 navigator.share 까지
        // 로그를 남기면 소음만 늘고, 정작 봐야 할 줄이 묻힌다.
        let remaining = 0;
        for (const file of FILES) {
            const text = readFileSync(join(JS_DIR, file), 'utf8');
            remaining += (text.match(/\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/g) || []).length;
        }
        expect(remaining).toBeGreaterThan(0);
    });
});
