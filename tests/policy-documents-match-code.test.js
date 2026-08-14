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

    const retainedNames = () => {
        const block = deletionSource
            .split('const RETAINED_COLLECTIONS = Object.freeze([')[1]
            .split(']);')[0];
        return [...block.matchAll(/\["([a-z_]+)"/g)].map((m) => m[1]);
    };

    it('keeps nothing, because no retention basis was found', () => {
        // 현금 결제가 없어 전자상거래법상 결제·재화 공급 기록의 보존 대상이 아니라고
        // 정리했다. 남길 근거가 없으면 남기지 않는다.
        expect(retainedNames()).toEqual([]);
    });

    it('deletes the two collections it used to hold back', () => {
        const owned = deletionSource
            .split('const OWNED_QUERIES = Object.freeze([')[1]
            .split(']);')[0];
        expect(owned).toContain('["blockchain_transactions", "userId"]');
        expect(owned).toContain('["reward_redemptions", "userId"]');
    });

    it('says so in the documents, without hedging', () => {
        expect(KO_PRIVACY).toContain('회원 탈퇴 시 예외 없이 지체 없이 파기합니다');
        expect(KO_PRIVACY).toContain('탈퇴 후 보관하는 개인정보가 없습니다');
        expect(KO_TERMS).toContain('서비스가 탈퇴 후 보관하는 개인정보는 없습니다');
        expect(EN_PRIVACY).toContain('destroyed without delay and without exception');
        expect(EN_TERMS).toContain('keeps no personal information after deletion');
    });

    it('would fail loudly if anything were put back on the retained list', () => {
        // 나중에 보존 대상이 생기면 방침에도 그 이름이 적혀야 한다. 코드만 고치고
        // 문서를 잊는 것이 애초에 이 사달의 원인이었다.
        for (const name of retainedNames()) {
            expect(KO_PRIVACY, `${name} must be disclosed`).toContain(name);
            expect(EN_PRIVACY, `${name} must be disclosed`).toContain(name);
        }
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
        // 기록은 화면을 직접 읽지 않는다 — 리디렉트를 다녀오면 화면이 비어 있기 때문이다.
        // 자세한 내용은 tests/consent-survives-redirect.test.js 참고.
        expect(authSource).toContain("age14: entry(selection['consent-age'] === true)");
    });

    it('is recorded with the rest of the consents', () => {
        const record = authSource
            .split('function buildConsentRecordFromSelection(selection = {}) {')[1]
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
        expect(readRepoFile('js/auth.js')).toContain("sensitive: entry(selection['consent-sensitive'] === true)");
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
        expect(KO_PRIVACY).toContain('시행일: 2026년 8월 15일');
        expect(KO_TERMS).toContain('시행일: 2026년 8월 15일');
        expect(EN_PRIVACY).toContain('Effective date: August 15, 2026');
        expect(EN_TERMS).toContain('Effective date: August 15, 2026');
    });

    it('matches the consent version recorded against each signup', () => {
        // 문서가 바뀌면 기록된 동의 버전도 바뀌어야 누가 어느 판에 동의했는지 알 수 있다.
        expect(readRepoFile('js/auth.js')).toContain("const CONSENT_DOC_VERSION = '2026-08-15';");
    });

    it('names the operator and the coupon vendor by their registered names', () => {
        expect(KO_PRIVACY).toContain('개인정보 보호책임자:</strong> 최석재');
        expect(KO_PRIVACY).toContain('케이티알파 주식회사');
        expect(EN_PRIVACY).toContain('최석재 (Choi Sukjae)');
        expect(EN_PRIVACY).toContain('KT Alpha Co., Ltd.');
    });

    // 확인된 사실:
    //   Firestore  asia-northeast3 (서울)      — firestore:databases:get
    //   Storage    us-central1     (미국)      — Cloud Storage 버킷 목록
    // 한동안 방침에 "기록과 사진은 서울에 저장, 국외 이전 아님"이라고 적혀 있었다.
    // Firestore 만 확인하고 Storage 는 같은 리전이겠거니 하고 적은 결과였고,
    // 그래서 혈액검사 결과지가 미국에 있는데 국외 이전이 아니라고 말하고 있었다.
    it('places each store where it actually is', () => {
        expect(KO_PRIVACY).toContain('asia-northeast3');
        expect(KO_PRIVACY).toContain('us-central1');
        expect(EN_PRIVACY).toContain('asia-northeast3');
        expect(EN_PRIVACY).toContain('us-central1');
    });

    it('calls the photo store an overseas transfer, because it is one', () => {
        expect(KO_PRIVACY).toContain('(Firebase Storage) — <strong>국외 이전</strong>');
        expect(EN_PRIVACY).toContain('(Firebase Storage) — <strong>overseas transfer</strong>');
        // 민감정보가 그 안에 있다는 사실을 흐리지 않는다.
        expect(KO_PRIVACY).toContain('<strong>혈액검사 결과지 이미지</strong>');
        expect(EN_PRIVACY).toContain('<strong>blood test report images</strong>');
    });

    it('never again claims that nothing leaves the country', () => {
        // 사진 저장소 자체가 국외다. AI 분석을 안 써도 국외로 나간다.
        expect(KO_PRIVACY).not.toContain('국외로 전송되는 개인정보가 없으며');
        expect(EN_PRIVACY).not.toContain('no personal information is sent abroad');
        // 재동의 화면은 동의를 받는 자리다. 거기에 틀린 문장이 있으면 더 나쁘다.
        expect(readRepoFile('index.html')).not.toContain('기록과 사진은 대한민국(서울) 서버에 저장됩니다');
    });

    it('states the Gemini tier, since it decides who may read the images', () => {
        // 유료 등급에서는 학습에 쓰지 않고 사람이 읽지 않는다. 무료였다면 혈액검사
        // 결과지가 학습에 쓰이고 검토자가 읽을 수 있어, 방침 문구가 완전히 달라진다.
        expect(KO_PRIVACY).toContain('유료 등급으로 이용합니다');
        expect(KO_PRIVACY).toContain('사람인 검토자가 내용을 읽지 않습니다');
        expect(EN_PRIVACY).toContain('on a <strong>paid tier.</strong>');
        expect(EN_PRIVACY).toContain('human reviewers do not read the content');
    });

    it('has no blanks left in either language', () => {
        expect(KO_PRIVACY.match(/\[\[[^\]]+\]\]/g) || []).toEqual([]);
        expect(EN_PRIVACY.match(/\[\[[^\]]+\]\]/g) || []).toEqual([]);
        expect(KO_TERMS.match(/\[\[[^\]]+\]\]/g) || []).toEqual([]);
        expect(EN_TERMS.match(/\[\[[^\]]+\]\]/g) || []).toEqual([]);
    });
});
