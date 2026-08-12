import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 문서와 코드가 어긋나면 문서 쪽이 거짓말이 된다. 예전 방침은 "제3자에게 제공하지
// 않습니다"라고 썼지만 쿠폰 교환 시 휴대폰 번호가 대행사로 나갔고, "탈퇴 시 지체 없이
// 파기"라고 썼지만 거래·교환 기록은 일부러 남기고 있었다. 약관은 만 18세 미만 불가라고
// 했지만 나이를 확인하는 코드가 아예 없었다.
//
// 여기서는 그 셋을 코드에 묶어둔다. 코드가 바뀌면 테스트가 깨지고, 그때 문서도 같이
// 고치게 된다.

const KO_PRIVACY = readRepoFile('privacy.html');
const KO_TERMS = readRepoFile('terms.html');
const EN_PRIVACY = readRepoFile('en/privacy.html');
const EN_TERMS = readRepoFile('en/terms.html');
const ALL_DOCS = [
    ['privacy.html', KO_PRIVACY],
    ['terms.html', KO_TERMS],
    ['en/privacy.html', EN_PRIVACY],
    ['en/terms.html', EN_TERMS]
];

describe('the coupon phone number is disclosed as a third-party provision', () => {
    it('is actually sent to the vendor', () => {
        // 이 줄이 사라지면 방침에서 그 조항을 빼야 한다.
        expect(readRepoFile('functions/reward-market.js')).toContain('phone_no: "{{recipientPhone}}"');
    });

    it('no longer claims data never leaves', () => {
        // 예전 문구는 예외 없이 "제공하지 않습니다"였다.
        expect(KO_PRIVACY).toContain('휴대전화번호');
        expect(KO_PRIVACY).toContain('기프티쇼');
        expect(EN_PRIVACY).toContain('Giftishow');
        expect(EN_PRIVACY).toContain('mobile phone number');
    });

    it('says the transfer only happens on redemption', () => {
        expect(KO_PRIVACY).toContain('교환하지 않으면 휴대전화번호가 전송되지 않습니다');
        expect(EN_PRIVACY).toContain('If no coupon is redeemed, no phone number is transmitted');
    });
});

describe('what deletion keeps is written down', () => {
    const deletionSource = readRepoFile('functions/account-deletion.js');

    it('the retained collections are the ones the documents name', () => {
        const retained = deletionSource
            .split('const RETAINED_COLLECTIONS = Object.freeze([')[1]
            .split(']);')[0];
        const names = [...retained.matchAll(/\["([a-z_]+)"/g)].map((m) => m[1]);
        expect(names).toEqual(['blockchain_transactions', 'reward_redemptions']);

        // 컬렉션 이름 그대로 적어둬야 나중에 대조가 된다.
        for (const name of names) {
            expect(KO_PRIVACY).toContain(name);
            expect(EN_PRIVACY).toContain(name);
        }
    });

    it('stops promising that everything is erased', () => {
        expect(KO_PRIVACY).toContain('탈퇴 후에도 보존하는 항목');
        expect(KO_TERMS).toContain('탈퇴 후에도 보관됩니다');
        expect(EN_PRIVACY).toContain('Retained after account deletion');
        expect(EN_TERMS).toContain('are retained after deletion');
    });

    it('warns that blockchain records and the wallet key cannot be recovered', () => {
        expect(KO_PRIVACY).toContain('블록체인에 기록된 거래는 서비스가 삭제할 수 없습니다');
        expect(KO_TERMS).toContain('탈퇴하면 보관 중이던 암호화 개인키가 삭제되어');
        expect(EN_PRIVACY).toContain('cannot be deleted by the Service');
        expect(EN_TERMS).toContain('can no longer be accessed');
    });
});

describe('the age rule is one the code can keep', () => {
    const indexSource = readRepoFile('index.html');
    const enIndexSource = readRepoFile('en/index.html');
    const authSource = readRepoFile('js/auth.js');

    it('is confirmed at sign-up, not merely asserted in the terms', () => {
        for (const [name, source] of [['index.html', indexSource], ['en/index.html', enIndexSource]]) {
            expect(source, name).toContain('<input type="checkbox" id="consent-age" data-consent-required="true">');
        }
        expect(authSource).toContain("age14: entry(readConsentCheckbox('consent-age'))");
    });

    it('is recorded with the rest of the consents', () => {
        const record = authSource
            .split('function buildSignupConsentRecord() {')[1]
            .split('\n}')[0];
        expect(record).toContain('terms:');
        expect(record).toContain('privacy:');
        expect(record).toContain('age14:');
        expect(record).toContain('sensitive:');
    });

    it('says 14 everywhere, and no longer says 18', () => {
        expect(KO_TERMS).toContain('만 14세 이상');
        expect(KO_PRIVACY).toContain('만 14세 미만 아동의 회원가입을 받지 않습니다');
        expect(EN_TERMS).toContain('14 or older');
        expect(EN_PRIVACY).toContain('under the age of 14');
        for (const [name, source] of ALL_DOCS) {
            expect(source, name).not.toContain('만 18세');
            expect(source, name).not.toContain('18 years');
        }
    });

    it('is translated, so the English sign-up asks the same question', () => {
        expect(readRepoFile('js/i18n.js')).toContain("'consent.age': 'I am 14 years of age or older'");
    });
});

describe('sensitive health data is handled as a separate consent', () => {
    it('the code takes it separately', () => {
        expect(readRepoFile('js/auth.js')).toContain("sensitive: entry(readConsentCheckbox('consent-sensitive'))");
    });

    it('and the policy says so, naming the article it comes from', () => {
        expect(KO_PRIVACY).toContain('제23조의 민감정보');
        expect(KO_PRIVACY).toContain('별도의 동의');
        expect(EN_PRIVACY).toContain('Article 23');
        expect(EN_PRIVACY).toContain('separate consent');
    });

    it('is honest that declining still lets you in', () => {
        expect(KO_PRIVACY).toContain('동의하지 않아도 가입과 기본 기능 이용에는 제한이 없으며');
        expect(EN_PRIVACY).toContain('Declining does not prevent registration');
    });
});

describe('the documents stay in step with each other', () => {
    it('carries one effective date across all four', () => {
        expect(KO_PRIVACY).toContain('시행일: 2026년 8월 12일');
        expect(KO_TERMS).toContain('시행일: 2026년 8월 12일');
        expect(EN_PRIVACY).toContain('Effective date: August 12, 2026');
        expect(EN_TERMS).toContain('Effective date: August 12, 2026');
    });

    it('matches the consent version recorded against each signup', () => {
        // 문서가 바뀌면 기록된 동의 버전도 바뀌어야 누가 어느 판에 동의했는지 알 수 있다.
        expect(readRepoFile('js/auth.js')).toContain("const CONSENT_DOC_VERSION = '2026-08-12';");
    });

    it('leaves the unfillable blanks visible instead of inventing them', () => {
        // 지어내면 안 되는 항목은 눈에 띄게 남긴다. 조용히 비워두면 빠뜨린다.
        expect(KO_PRIVACY).toContain('[[운영자 성명 — 채워야 함]]');
        expect(KO_PRIVACY).toContain('[[운영 법인명 — 채워야 함]]');
        expect(EN_PRIVACY).toContain('to be filled in');
    });
});
