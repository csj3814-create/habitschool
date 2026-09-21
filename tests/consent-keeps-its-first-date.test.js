import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 동의 기록에서 가장 중요한 것은 "언제 받았는가" 다. 그런데 at 은 제출할 때마다
// 오늘로 덮였다. 그래서 어떤 계정의 기록을 봐도 처음 동의한 날을 알 수 없었다.
//
// 2026-09-18 "동의 화면이 왜 계속 뜨지?" 를 조사할 때 여기서 막혔다. at 이 그날이길래
// "오늘 처음 동의했다" 로 읽었는데, 이미 동의한 사람이 다시 제출한 것일 수도 있었다.
// 둘을 가릴 방법이 없었다 — 그러니 "한 번 동의하면 다시 안 뜬다" 도 증명할 수 없다.

const AUTH = readRepoFile('js/auth.js');

function buildRecord(selection, previous) {
    const start = AUTH.indexOf('function buildConsentRecordFromSelection(selection = {}');
    const end = AUTH.indexOf('\n}\n', start);
    expect(start).toBeGreaterThan(-1);
    const fn = AUTH.slice(start, end + 2);
    return Function('CONSENT_DOC_VERSION', `${fn}
        return buildConsentRecordFromSelection;`)('2026-08-15')(selection, previous);
}

const ALL_YES = {
    'consent-terms': true,
    'consent-privacy': true,
    'consent-age': true,
    'consent-sensitive': true,
};

describe('a consent record keeps the date it was first given', () => {
    it('stamps both dates the first time', () => {
        const record = buildRecord(ALL_YES, {});
        expect(record.terms.agreed).toBe(true);
        expect(record.terms.at).toBe(record.terms.firstAgreedAt);
        expect(record.terms.version).toBe('2026-08-15');
    });

    it('does not move the first date when the same person agrees again', () => {
        const previous = {
            terms: { agreed: true, at: '2026-08-20T01:00:00.000Z', firstAgreedAt: '2026-08-20T01:00:00.000Z' },
        };
        const record = buildRecord(ALL_YES, previous);
        expect(record.terms.firstAgreedAt).toBe('2026-08-20T01:00:00.000Z');
        // 마지막으로 지난 날은 새로 찍힌다. 둘 다 있어야 "또 물었다" 가 보인다.
        expect(record.terms.at).not.toBe('2026-08-20T01:00:00.000Z');
    });

    it('rescues the first date from records written before this field existed', () => {
        // 이미 있는 100건에는 firstAgreedAt 이 없다. at 이 우리가 아는 유일한 시각이다.
        const previous = { privacy: { agreed: true, at: '2026-05-02T09:00:00.000Z' } };
        const record = buildRecord(ALL_YES, previous);
        expect(record.privacy.firstAgreedAt).toBe('2026-05-02T09:00:00.000Z');
    });

    it('leaves no date on something that was not agreed to', () => {
        const record = buildRecord({ ...ALL_YES, 'consent-sensitive': false }, {});
        expect(record.sensitive.agreed).toBe(false);
        expect(record.sensitive.at).toBe(null);
        expect(record.sensitive.firstAgreedAt).toBe(null);
    });

    it('does not inherit a first date from a consent that was refused before', () => {
        // 거부했던 항목을 이번에 동의했다면, 처음 동의한 날은 오늘이다.
        const previous = { sensitive: { agreed: false, at: null, firstAgreedAt: null } };
        const record = buildRecord(ALL_YES, previous);
        expect(record.sensitive.firstAgreedAt).toBe(record.sensitive.at);
    });

    it('is handed the record the consent screen was actually showing', () => {
        // 이전 기록 없이 부르면 매번 오늘이 되어 이 필드가 무의미해진다.
        expect(AUTH).toContain('_reconsentPriorConsents = userData?.consents || {};');
        expect(AUTH).toContain(
            'buildConsentRecordFromSelection(collectReconsentSelection(), _reconsentPriorConsents)'
        );
    });
});
