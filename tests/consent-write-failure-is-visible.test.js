import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

const AUTH = readRepoFile('js/auth.js');
const RULES = readRepoFile('firestore.rules');

// 동의 기록이 6주 동안 한 건도 저장되지 않았는데 아무도 몰랐다.
// firestore.rules 에 consents 를 추가한 커밋은 8월 9일이었지만 규칙은 8월 5일자가
// 그대로 떠 있었고, 규칙 배포는 hosting/functions 단축 승인에 포함되지 않아 한 번도
// 나가지 않았다. 그 사이 모든 consents 쓰기가 permission-denied 로 거부됐다.
// 562명 중 동의 기록을 가진 회원이 0명이 되고 나서야 드러났다.
//
// 드러나지 않은 이유는 규칙이 아니라 catch 였다.

describe('a failed consent write cannot pass unnoticed again', () => {
    it('no longer swallows the member document write', () => {
        expect(AUTH).not.toContain('await setDoc(userRef, updateData, { merge: true }).catch(() => {});');
        expect(AUTH).toContain("console.error('회원 문서 저장 실패:', error?.code || '', error?.message || error);");
    });

    it('says specifically when it was the consent that failed', () => {
        expect(AUTH).toContain('if (updateData.consents) {');
        expect(AUTH).toContain('Firestore 규칙에 consents 가 있는지 확인하세요.');
    });

    it('still lets the member in — a logging failure is not a login failure', () => {
        // 로그인을 막으면 규칙 문제 하나로 전원이 못 들어온다.
        const block = AUTH.split('await setDoc(userRef, updateData, { merge: true }).catch((error) => {')[1]
            .split('});')[0];
        expect(block).not.toContain('throw');
        expect(block).not.toContain('return false');
    });
});

describe('the re-consent screen names the failure it hit', () => {
    it('separates permission-denied from something worth retrying', () => {
        // permission-denied 는 기다린다고 풀리지 않는다. "잠시 후 다시" 는 거짓 안내다.
        expect(AUTH).toContain("const code = String(error?.code || '').replace(/^firestore\\//, '');");
        expect(AUTH).toContain("code === 'permission-denied'");
        expect(AUTH).toContain('동의를 저장할 권한이 없어요');
    });

    it('shows the code for anything else, instead of a bare apology', () => {
        expect(AUTH).toContain('${code ? ` (${code})` : \'\'}');
    });
});

describe('the rule the code depends on is actually in the file', () => {
    it('allows consents on both update and create', () => {
        // 이 테스트는 파일만 본다. 배포됐는지는 파일이 알 수 없다 —
        // 그것이 이번 사고의 핵심이었고, 그래서 배포 목록에 규칙을 넣어야 한다.
        const updateWhitelist = RULES.split('function isAllowedUserField() {')[1].split('}')[0];
        const createWhitelist = RULES.split('function isAllowedUserCreate() {')[1].split('}')[0];
        expect(updateWhitelist).toContain("'consents'");
        expect(createWhitelist).toContain("'consents'");
    });
});
