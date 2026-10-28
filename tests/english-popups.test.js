// 해외 3단계 E6-5(2026-10-29): 영어 앱에서 여는 팝업 창에 한국어가 남지 않는다.
// 챌린지 완주 보상 창은 영어 회원이 보상을 받는 순간 한국어만 보였다. 계정 삭제 창·친구 요청 창·사진 확대 창·앱으로 열기 띠도 같았다.
// 한국어 화면 글자는 tests/korean-app-unchanged-i18n.test.js 가 지킨다. 여기서는 한국어 사전 값이 예전 문장과 같은지도 본다.

import { describe, expect, it } from 'vitest';
import { readRawRepoFile } from './source-helpers.js';
import { KO_MESSAGES } from '../js/i18n-ko.js';
import { EN_MESSAGES } from '../js/i18n-en.js';

const HANGUL = /[가-힣]/;
const EN_INDEX = readRawRepoFile('en/index.html');
const APP = readRawRepoFile('js/app-core.js');
const AUTH = readRawRepoFile('js/auth.js');

function block(html, marker, endMarker) {
    const start = html.indexOf(marker);
    expect(start, marker).toBeGreaterThan(-1);
    const end = html.indexOf(endMarker, start + marker.length);
    expect(end, endMarker).toBeGreaterThan(start);
    return html.slice(start, end);
}

function koreanLeft(html) {
    const text = html.replace(/<!--[\s\S]*?-->/g, '');
    const attrs = [...text.matchAll(/\s(?:aria-label|alt|title|placeholder)="([^"]*)"/g)].map((m) => m[1]);
    const words = text.replace(/<[^>]*>/g, '\n').split('\n').map((s) => s.trim());
    return [...attrs, ...words].filter((s) => HANGUL.test(s));
}

function fnBody(source, signature) {
    const start = source.indexOf(signature);
    expect(start, signature).toBeGreaterThan(-1);
    return source.slice(start, source.indexOf('\n};\n', start));
}

function codeKorean(body) {
    // 주석은 빼고 문자열 속 한글만 본다. 조사 고르기(withJosa(…, '을를'))는 문장이 아니라서 뺀다.
    return body.split('\n')
        .map((line) => line.replace(/^\s*\/\/.*$/, '').replace(/\s\/\/\s.*$/, '').replace(/withJosa\([^)]*\)/g, ''))
        .filter((line) => HANGUL.test(line));
}

describe('영어 첫 화면의 팝업 창에 한국어가 없다', () => {
    it.each([
        ['챌린지 완주 보상', '<div id="challenge-reward-modal"', '<!--'],
        ['친구 요청', '<div id="friend-request-modal"', '<!-- ===== 기존 앱 지갑'],
        ['계정 삭제', '<div id="delete-account-modal"', '<div id="legacy-wallet-export-modal"'],
        ['사진 확대', '<div id="lightbox-modal"', '<div id="toast"'],
        ['앱으로 열기 띠', '<div id="open-in-app-banner"', '<div class="header"'],
        ['공유 가져오기', '<div id="shared-import-modal"', '<div class="shared-import-options">'],
    ])('%s', (_, marker, endMarker) => {
        expect(koreanLeft(block(EN_INDEX, marker, endMarker))).toEqual([]);
    });

    it('화면 읽기 이름표·열 때 다시 쓰는 단추도 영어', () => {
        expect(EN_INDEX).toContain('<div id="login-modal" role="dialog" data-i18n-aria-label="login.dialogAria" aria-label="Sign in">');
        expect(EN_INDEX).toContain('data-i18n-aria-label="profile.regionAria" aria-label="My profile"');
        expect(EN_INDEX).toContain('<h3 id="reconsent-title" class="sr-only" data-i18n="reconsent.srTitle">Consent</h3>');
        expect(EN_INDEX).toContain('data-i18n-initial="onboarding.start">Get started</button>');
        expect(EN_INDEX).toContain('data-i18n-initial="bugReport.send">Send</button>');
    });
});

describe('챌린지 완주 보상 창 코드', () => {
    const open = fnBody(APP, 'window.openChallengeRewardCelebration = function');
    const claim = fnBody(APP, 'window.confirmChallengeRewardClaim = async function');

    it('한국어 문장을 박아 두지 않고 사전에서 읽는다', () => {
        expect(codeKorean(open)).toEqual([]);
        expect(codeKorean(claim)).toEqual([]);
    });

    it('한국어 문장은 예전과 글자까지 같다', () => {
        expect(KO_MESSAGES['challenge.reward.kickerDone']).toBe('챌린지 완주');
        expect(KO_MESSAGES['challenge.reward.kickerSettle']).toBe('챌린지 정산');
        // 예전: `${withJosa(label, '을를')} 끝냈어요`, `${label} 정산이 준비됐어요`
        expect(KO_MESSAGES['challenge.reward.titleDone']).toBe('{labelObj} 끝냈어요');
        expect(KO_MESSAGES['challenge.reward.titleSettle']).toBe('{label} 정산이 준비됐어요');
        expect(open).toContain("t('challenge.reward.titleDone', { label, labelObj: withJosa(label, '을를') })");
        expect(KO_MESSAGES['challenge.reward.progress']).toBe('{completed}/{total}일 · {percent}% 달성');
        expect(KO_MESSAGES['challenge.reward.noteChain']).toBe('블록체인에 발행하느라 30초에서 1분쯤 걸려요.');
        expect(KO_MESSAGES['challenge.reward.issuing']).toBe('보상을 발행하고 있어요. 창을 닫아도 보상은 들어옵니다.');
        expect(KO_MESSAGES['challenge.reward.failed']).toBe('수령하지 못했어요. 안내 메시지를 확인해 주세요.');
    });

    it('영어 문장은 이름표(🔥 7-day Weekly)와 이어 읽힌다', () => {
        expect(EN_MESSAGES['challenge.tier.weekly']).toBe('🔥 7-day Weekly');
        expect(EN_MESSAGES['challenge.reward.titleDone']).toBe('You finished the {label} challenge');
        expect(EN_MESSAGES['challenge.reward.progress']).toBe('{completed}/{total} days · {percent}% done');
    });

    // 한 보상을 받으면 수령 단추를 감춘다. 다음 보상 창을 열 때 되살리지 않아, 새로고침 전까지 두 번째 보상을 받을 단추가 없었다.
    it('다시 열면 수령 단추가 다시 보인다', () => {
        expect(claim).toContain("claimBtn.style.display = 'none';");
        expect(open).toContain("claimBtn.style.display = '';");
    });
});

describe('계정 삭제 창 코드', () => {
    it('잔액 칸과 안내 토스트도 사전에서', () => {
        const fill = AUTH.slice(AUTH.indexOf('async function fillDeleteWalletSummary()'), AUTH.indexOf('window.deleteAccountAndData = async function'));
        expect(codeKorean(fill)).toEqual([]);
        expect(KO_MESSAGES['profile.delete.balanceFailed']).toBe('조회 실패 (잔액이 있을 수 있음)');
        expect(AUTH).toContain("showToast(t('profile.delete.exportFirst'));");
        expect(KO_MESSAGES['profile.delete.exportFirst']).toBe('지갑 탭에서 개인키를 먼저 내보내 주세요.');
    });
});
