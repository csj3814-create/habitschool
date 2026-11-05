import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FIRST_RECORD_STEP_EVENTS, PRODUCT_EVENT_NAMES, buildProductEvent, isInFirstRecordPeriod } from '../js/product-events.js';
import { readRepoFile } from './source-helpers.js';

// 2026-11-05: 10/25 이후 웹은 기록 화면 도착 17명 중 3명, 앱은 18명 중 8명만 첫 보상까지 갔다.
// 직접 가입해 따라가면 막히는 곳이 없어서, 고치기 전에 어디서 멈추는지부터 잰다.
const CORE = readRepoFile('js/app-core.js');

describe('첫 기록 단계 세기', () => {
    it('가입 7일 안이고 첫 기록 창을 못 본 회원만 센다', () => {
        const nowMs = Date.parse('2026-11-08T00:00:00Z');
        expect(isInFirstRecordPeriod({ creationTime: '2026-11-05T00:00:00Z', nowMs })).toBe(true);
        expect(isInFirstRecordPeriod({ creationTime: '2026-10-30T00:00:00Z', nowMs })).toBe(false);
        expect(isInFirstRecordPeriod({ creationTime: '2026-11-05T00:00:00Z', resultShown: true, nowMs })).toBe(false);
        expect(isInFirstRecordPeriod({ nowMs })).toBe(false);
    });

    it('모든 단계가 승인된 이벤트라서 실제로 나간다', () => {
        FIRST_RECORD_STEP_EVENTS.forEach((name) => {
            expect(PRODUCT_EVENT_NAMES).toContain(name);
            expect(buildProductEvent(name, { tab: 'diet' })?.params).toEqual({ tab: 'diet' });
            // 코드 어딘가에서 실제로 부른다.
            expect(CORE).toContain(`'${name}'`);
        });
    });

    it('소개 페이지 이벤트도 승인 목록에 있다 — 없으면 조용히 버려진다', () => {
        expect(CORE).toContain("trackProductEvent('landing_view'");
        expect(buildProductEvent('landing_view', { entry_point: 'root' })?.params).toEqual({ entry_point: 'root' });
    });

    // landing_view 는 11/3 에 부르기 시작했는데 목록에 없어 이틀간 한 건도 나가지 않았고, 아무 신호도 없었다.
    it('코드에서 부르는 이벤트는 모두 승인 목록에 있다', () => {
        const jsDir = fileURLToPath(new URL('../js/', import.meta.url));
        const used = new Set(readdirSync(jsDir).filter((name) => name.endsWith('.js')).flatMap((name) => (
            [...readFileSync(`${jsDir}${name}`, 'utf8').matchAll(/trackProductEvent\('([a-z_0-9]+)'/g)].map((match) => match[1])
        )));
        expect(used.size).toBeGreaterThan(5);
        expect([...used].filter((name) => !PRODUCT_EVENT_NAMES.includes(name))).toEqual([]);
    });

    it('개인 정보를 보내지 않는다 — 탭과 오류 종류만', () => {
        const params = buildProductEvent('first_record_save_fail', { tab: 'diet', error_kind: 'network', uid: 'abc', email: 'a@b.c' })?.params;
        expect(params).toEqual({ tab: 'diet', error_kind: 'network' });
    });
});
