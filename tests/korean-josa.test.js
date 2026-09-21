import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withJosa } from '../js/korean.js';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');
const APP = read('js/app-core.js');

// 2026-09-21 지적: "조사에 오타 있다. 5주 연속 배지를 이라고 하던지."
//
// 배지 안내가 "주간 달성를 얻었어요", "3주 연속를 얻었어요", "도전 정신를
// 얻었어요" 로 나가고 있었다. 셋 다 받침이 있어 '을' 이 맞는데 코드가 '를' 로
// 못 박혀 있었다.
describe('the particle follows the name, not the code', () => {
    it('gets the badge names in the screenshots right', () => {
        expect(withJosa('주간 달성', '을를')).toBe('주간 달성을');
        expect(withJosa('3주 연속', '을를')).toBe('3주 연속을');
        expect(withJosa('5주 연속', '을를')).toBe('5주 연속을');
        expect(withJosa('10주 연속', '을를')).toBe('10주 연속을');
        expect(withJosa('도전 정신', '을를')).toBe('도전 정신을');
    });

    it('still says 를 when there is no 받침', () => {
        expect(withJosa('기록왕', '을를')).toBe('기록왕을');
        expect(withJosa('해빛스쿨', '을를')).toBe('해빛스쿨을');
        expect(withJosa('챌린지', '을를')).toBe('챌린지를');
        expect(withJosa('미션 마스터', '을를')).toBe('미션 마스터를');
    });

    it('is used where the badge name is printed', () => {
        expect(APP).toContain("title: `${withJosa(badge?.name || '배지', '을를')} 얻었어요`");
        expect(APP).not.toContain("}를 얻었어요`");
    });

    it('is used for the other two places that hardcoded it', () => {
        // 챌린지 완주 안내와 자산 내역 빈 화면도 같은 실수를 하고 있었다.
        expect(APP).toContain("`${withJosa(label, '을를')} 끝냈어요`");
        expect(APP).toContain("`${withJosa(title, '을를')} 확인하는 중입니다.`");
        expect(APP).toContain("`아직 ${withJosa(title, '이가')} 없습니다.`");
    });
});

describe('one copy of the rule, used by both sides', () => {
    it('lives in a module with no dependencies', () => {
        const korean = read('js/korean.js');
        expect(korean).not.toContain('import ');
        expect(korean).toContain('export function withJosa');
    });

    it('is what the admin console uses too', () => {
        // 관제탑에 같은 함수가 따로 있었다. 두 벌이면 한쪽만 고쳐진다.
        const admin = read('js/admin-utils.js');
        expect(admin).toContain("export { withJosa } from './korean.js';");
        expect(admin).not.toContain('const JOSA_TAIL_HAS_BATCHIM');
    });

    it('is cached by the service worker like the other modules', () => {
        expect(read('sw.js')).toMatch(/'\.\/js\/korean\.js\?v=\d+'/);
    });
});
