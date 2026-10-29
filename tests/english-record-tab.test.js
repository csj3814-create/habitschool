// 해외 3단계 E6-5 나(2026-10-29): 영어 기록 탭에 숨겨 두었던 칸(퀘스트 판·공복 그래프·식단 하루 요약·하이퍼랩스 안내)을 영어로 열고,
// 걸음수 입력·걸음 캡처 읽기에서 영어 회원에게 나가던 한국어 알림을 사전으로 옮긴다.
// 한국어 화면 글자는 tests/korean-app-unchanged-i18n.test.js 가 지킨다. 여기서는 한국어 사전 값이 예전 문장과 같은지도 본다.

import { describe, expect, it } from 'vitest';
import { readRawRepoFile } from './source-helpers.js';
import { KO_MESSAGES } from '../js/i18n-ko.js';
import { EN_MESSAGES } from '../js/i18n-en.js';

const HANGUL = /[가-힣]/;
const EN_INDEX = readRawRepoFile('en/index.html');
const EN_CSS = readRawRepoFile('styles-en.css');
const APP = readRawRepoFile('js/app-core.js');

function block(html, marker, endMarker) {
    const start = html.indexOf(marker);
    expect(start, marker).toBeGreaterThan(-1);
    const end = html.indexOf(endMarker, start + marker.length);
    expect(end, endMarker).toBeGreaterThan(start);
    return html.slice(start, end);
}

function koreanLeft(html) {
    // 사용법 ⓘ 단추(guide-help-btn)는 영어 앱에서 통째로 숨긴다(js/guide-help.js initGuideHelp). 그 이름표는 보지 않는다.
    const text = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<span class="guide-help-btn"[^>]*>\?<\/span>/g, '');
    const attrs = [...text.matchAll(/\s(?:aria-label|alt|title|placeholder)="([^"]*)"/g)].map((m) => m[1]);
    const words = text.replace(/<[^>]*>/g, '\n').split('\n').map((s) => s.trim());
    return [...attrs, ...words].filter((s) => HANGUL.test(s));
}

function fnBody(source, signature) {
    const start = source.indexOf(signature);
    expect(start, signature).toBeGreaterThan(-1);
    return source.slice(start, source.indexOf('\n}\n', start));
}

function codeKorean(body) {
    // 주석과 개발자 콘솔 줄은 빼고 문자열 속 한글만 본다.
    return body.split('\n')
        .map((line) => line.replace(/^\s*\/\/.*$/, '').replace(/\s\/\/\s.*$/, ''))
        .filter((line) => !/console\.(log|warn|error)\(/.test(line))
        .filter((line) => HANGUL.test(line));
}

describe('영어 기록 탭에 숨겨 둔 칸을 연다', () => {
    it('퀘스트 판·가이드 단추·공복 그래프·식단 하루 요약을 더는 숨기지 않는다', () => {
        const hideRule = EN_CSS.slice(0, EN_CSS.indexOf('display: none !important;', EN_CSS.indexOf('html.locale-en .community-history-btn-wrap')));
        const selectors = hideRule.slice(hideRule.lastIndexOf('*/') + 2);
        expect(selectors).not.toContain('.quest-board');
        expect(selectors).not.toContain('.guide-btn');
        expect(selectors).not.toContain('#fasting-graph-card');
        expect(selectors).not.toContain('#diet-day-summary-container');
        // 한국 것이라 숨기는 단톡방 띠와, 아직 한국어 페이지인 지난 현황 링크는 그대로 숨긴다.
        expect(selectors).toContain('.community-history-btn-wrap');
        expect(selectors).toContain('.chat-banner-fixed');
    });

    it.each([
        ['식단 퀘스트 판', '<div class="quest-board">', '<!-- 업로드 CTA -->'],
        ['공복 그래프', '<div class="card" id="fasting-graph-card"', '<div id="exercise" class="content-section">'],
        ['하이퍼랩스 안내 창', '<div class="modal-overlay" id="guide-modal"', '<div class="modal-overlay" id="notification-permission-guide-modal"'],
        ['걸음수 카드', '<div class="card step-card" id="step-card">', '<div id="step-import-banner"'],
        ['명상 칸', '<strong id="meditation-method-name"', '<div class="meditation-practice-line" id="meditation-phase-line"'],
        ['저장 줄', '<div class="submit-bar-helper" id="submit-bar-helper"', '<button class="submit-btn" id="saveDataBtn"'],
    ])('%s에 한국어가 없다', (_, marker, endMarker) => {
        expect(koreanLeft(block(EN_INDEX, marker, endMarker))).toEqual([]);
    });

    // 저장 단추의 이름표(aria-label)는 코드가 탭마다 다시 쓴다(applySaveButtonLabel). data-i18n-aria-label 을 달면 화면 감시가
    // 그 이름표를 고정 값으로 덮어쓰므로 처음 글자만 영어로 둔다.
    it('저장 단추 처음 글자도 영어', () => {
        expect(EN_INDEX).toContain('data-i18n-initial="record.saveBar.saveInitial" aria-label="현재 진행상황 저장 및 포인트 받기">Save</button>');
    });

    it('명상 안내 줄도 영어로 시작한다', () => {
        expect(EN_INDEX).toContain('id="meditation-phase-line" data-i18n-initial="meditation.initial.phase">Let your belly gently rise as you breathe in.</div>');
    });
});

describe('공복 그래프 코드', () => {
    const draw = fnBody(APP, 'function drawFastingChart()');

    it('한국어 문장을 박아 두지 않고 사전에서 읽는다', () => {
        expect(codeKorean(draw)).toEqual([]);
    });

    it('한국어 문장은 예전과 글자까지 같다', () => {
        expect(KO_MESSAGES['diet.fastingGraph.latestWeight']).toBe('최근: {value}kg');
        expect(KO_MESSAGES['diet.fastingGraph.latestGlucose']).toBe('최근: {value}mg/dL');
        expect(KO_MESSAGES['diet.fastingGraph.latestBp']).toBe('최근: {systolic}/{diastolic}mmHg');
        expect(KO_MESSAGES['diet.fastingGraph.notEnough']).toBe('데이터 부족');
        expect(KO_MESSAGES['diet.fastingGraph.needTwo']).toBe('기록이 2개 이상 필요합니다');
    });
});

describe('걸음수 입력과 걸음 캡처 읽기', () => {
    const manual = fnBody(APP, 'function setManualSteps()');
    const shot = fnBody(APP, 'async function handleStepScreenshot(fileInput)');

    it('한국어 문장을 박아 두지 않고 사전에서 읽는다', () => {
        expect(codeKorean(manual)).toEqual([]);
        expect(codeKorean(shot)).toEqual([]);
    });

    it('한국어 문장은 예전과 글자까지 같다', () => {
        expect(KO_MESSAGES['steps.manual.invalid']).toBe('⚠️ 올바른 걸음수를 입력하세요.');
        expect(KO_MESSAGES['steps.manual.tooLarge']).toBe('⚠️ 걸음수가 너무 큽니다.');
        expect(KO_MESSAGES['steps.manual.done']).toBe('👟 {count}보 입력 완료!');
        expect(KO_MESSAGES['steps.shot.recognized']).toBe('👟 {count}보 인식 완료!');
        expect(KO_MESSAGES['steps.shot.duplicate']).toBe('⚠️ 이미 등록된 캡처입니다. 다른 캡처를 올려주세요.');
        expect(KO_MESSAGES['steps.shot.loginRequired']).toBe('⚠️ 로그인이 필요합니다.');
    });

    it('영어 숫자는 영어 쉼표로 쓴다', () => {
        expect(manual).toContain("val.toLocaleString(isEnglishLocale() ? 'en-US' : undefined)");
        expect(EN_MESSAGES['steps.manual.done']).toBe('👟 {count} steps entered!');
    });
});
