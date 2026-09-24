import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUTOFIX_STATES, STALE_WORKING_MS, selectPending, summarizeReport } from '../scripts/bug-inbox.mjs';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');

// 2026-09-24: 관제탑 오류 제보를 하루 한 번 + "오류 체크" 때 자동으로 점검한다.
// 이 도구가 고르는 제보가 틀리면 같은 제보를 매일 다시 고치거나, 새 제보를 놓친다.
describe('처리할 제보 고르기', () => {
    const NOW = Date.parse('2026-09-24T12:00:00Z');
    const report = (id, extra = {}) => ({ id, createdAt: `2026-09-2${id}T00:00:00Z`, status: 'open', autoFix: null, ...extra });

    it('아직 아무도 손대지 않은 제보를 오래된 것부터 고른다', () => {
        const picked = selectPending([report('3'), report('1'), report('2')], NOW);
        expect(picked.map((r) => r.id)).toEqual(['1', '2', '3']);
    });

    it('관제탑에서 처리 완료한 것은 고르지 않는다', () => {
        expect(selectPending([report('1', { status: 'done' })], NOW)).toEqual([]);
    });

    it('자동 점검이 결론을 낸 것은 다시 고르지 않는다', () => {
        for (const state of ['fixed_on_staging', 'needs_owner', 'skipped']) {
            const r = report('1', { autoFix: { state, at: '2026-09-20T00:00:00Z' } });
            expect(selectPending([r], NOW)).toEqual([]);
        }
    });

    it('점검 중인 것은 두 시간이 지나 멈춘 것으로 보일 때만 다시 고른다', () => {
        const fresh = report('1', { autoFix: { state: 'working', at: new Date(NOW - 60_000).toISOString() } });
        const stale = report('2', { autoFix: { state: 'working', at: new Date(NOW - STALE_WORKING_MS - 60_000).toISOString() } });
        expect(selectPending([fresh, stale], NOW).map((r) => r.id)).toEqual(['2']);
    });

    it('상태 값은 네 가지뿐이다 — 관제탑 표시와 같은 목록', () => {
        expect(AUTOFIX_STATES).toEqual(['working', 'fixed_on_staging', 'needs_owner', 'skipped']);
        const admin = read('admin.html');
        for (const state of AUTOFIX_STATES) expect(admin).toContain(`${state}: [`);
    });
});

describe('제보 요약에 분석 재료가 함께 온다', () => {
    const doc = {
        name: 'projects/p/databases/(default)/documents/bug_reports/abc123',
        createTime: '2026-09-24T00:00:00Z',
        fields: {
            message: { stringValue: '공유가 안 돼요' },
            uid: { stringValue: 'u1' },
            screenshotUrl: { stringValue: 'https://example.com/s.png' },
            device: { mapValue: { fields: { assetVersion: { stringValue: '443' }, isAndroidApp: { booleanValue: true } } } },
            consoleEntries: {
                arrayValue: {
                    values: Array.from({ length: 40 }, (_, i) => ({
                        mapValue: { fields: { level: { stringValue: 'error' }, text: { stringValue: `e${i}` } } }
                    }))
                }
            }
        }
    };

    it('콘솔 기록(최근 30건)·기기 정보·스크린샷을 함께 담는다', () => {
        const r = summarizeReport('prod', doc);
        expect(r.id).toBe('abc123');
        expect(r.consoleEntries).toHaveLength(30);
        expect(r.consoleEntries.at(-1)).toEqual({ level: 'error', text: 'e39' });
        expect(r.device.assetVersion).toBe('443');
        expect(r.device.isAndroidApp).toBe(true);
        expect(r.screenshotUrl).toBe('https://example.com/s.png');
    });
});

describe('자동 점검은 운영에 손대지 않는다', () => {
    const SCRIPT = read('scripts/bug-inbox.mjs');

    it('status 는 사람이 부르는 done 명령에서만 바꾼다', () => {
        const setBlock = SCRIPT.split("if (command === 'set') {")[1].split("if (command === 'done')")[0];
        expect(setBlock).toContain('autoFix:');
        expect(setBlock).not.toContain('status');
    });

    it('배포 명령을 부르지 않는다', () => {
        expect(SCRIPT).not.toContain('deploy');
    });
});
