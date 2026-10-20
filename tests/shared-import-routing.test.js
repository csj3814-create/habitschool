import { describe, expect, it } from 'vitest';
import {
    SHARED_IMPORT_AUTO_ROUTE_CONFIDENCE,
    SHARED_IMPORT_CLASSIFY_DEADLINE_MS,
    decideSharedImportAutoRoute,
    normalizeSharedImportClassification
} from '../js/shared-import-routing.js';
import { readAppSource } from './source-helpers.js';

const APP = readAppSource();

// 2026-10-20: 서버 분류기는 9/23 부터 body(체성분)를 돌려주는데, 화면 쪽이
// diet·exercise·sleep 만 받아 body 를 unknown 으로 바꿨다. "체성분이면 바로 채운다" 가
// 한 번도 걸리지 않았다(Fitdays 에서 온 것은 보낸 앱 이름으로 따로 가서 몰랐다).
describe('분류 결과 받기', () => {
    it('체성분(body)을 버리지 않는다', () => {
        expect(normalizeSharedImportClassification({ category: 'body', confidence: 0.7 }).category).toBe('body');
    });

    it('모르는 이름은 unknown, 확신은 0~1', () => {
        expect(normalizeSharedImportClassification({ category: 'pet', confidence: 3 })).toMatchObject({ category: 'unknown', confidence: 1 });
        expect(normalizeSharedImportClassification(null)).toBeNull();
    });

    it('운동은 걸음 캡처인지 함께 넘긴다', () => {
        expect(normalizeSharedImportClassification({ category: 'exercise', exerciseMode: 'step_screenshot' }).exerciseMode).toBe('step_screenshot');
        expect(normalizeSharedImportClassification({ category: 'exercise' }).exerciseMode).toBe('cardio_image');
    });

    it('화면은 이 함수를 쓴다 — 따로 만든 복사본이 body 를 버리지 않게', () => {
        expect(APP).not.toContain('function normalizeSharedImportClassification(');
        expect(APP).toMatch(/import \{[^}]*normalizeSharedImportClassification[^}]*\} from '\.\/shared-import-routing\.js\?v=\d+'/);
    });
});

describe('바로 넣어도 되는가', () => {
    const base = { fileCount: 1, elapsedMs: 4000, targetAvailable: true };
    const sure = (category, confidence = 0.95) => ({ ...base, classification: { category, confidence } });

    it('확신이 높고, 회원이 시트를 안 만졌고, 자리가 비었으면 넣는다', () => {
        expect(decideSharedImportAutoRoute(sure('diet'))).toEqual({ auto: true, reason: 'confident' });
    });

    it('예전 1.8초 제한은 없다 — 마감선 안이면 늦게 와도 넣는다', () => {
        expect(decideSharedImportAutoRoute({ ...sure('diet'), elapsedMs: 9000 }).auto).toBe(true);
        expect(decideSharedImportAutoRoute({ ...sure('diet'), elapsedMs: SHARED_IMPORT_CLASSIFY_DEADLINE_MS + 1 })).toEqual({ auto: false, reason: 'late' });
    });

    it('회원이 시트를 만졌거나 골랐으면 넣지 않는다', () => {
        expect(decideSharedImportAutoRoute({ ...sure('diet'), userEngaged: true }).reason).toBe('engaged');
        expect(decideSharedImportAutoRoute({ ...sure('diet'), manuallyPicked: true }).reason).toBe('picked');
    });

    it('여러 장이면 시트에서 고른다', () => {
        expect(decideSharedImportAutoRoute({ ...sure('diet'), fileCount: 2 }).reason).toBe('multiple');
    });

    it('있던 기록을 바꿔 끼우지 않는다', () => {
        expect(decideSharedImportAutoRoute({ ...sure('sleep'), targetAvailable: false }).reason).toBe('occupied');
    });

    it('종류마다 기준이 다르다: 식단·운동 0.85, 수면 0.9, 체성분 0.5', () => {
        expect(SHARED_IMPORT_AUTO_ROUTE_CONFIDENCE).toEqual({ diet: 0.85, exercise: 0.85, sleep: 0.9, body: 0.5 });
        expect(decideSharedImportAutoRoute(sure('exercise', 0.85)).auto).toBe(true);
        expect(decideSharedImportAutoRoute(sure('sleep', 0.88)).reason).toBe('low');
        expect(decideSharedImportAutoRoute(sure('sleep', 0.9)).auto).toBe(true);
        expect(decideSharedImportAutoRoute(sure('body', 0.5)).auto).toBe(true);
        expect(decideSharedImportAutoRoute(sure('diet', 0.84)).reason).toBe('low');
    });

    it('모르면 넣지 않는다', () => {
        expect(decideSharedImportAutoRoute(sure('unknown')).auto).toBe(false);
        expect(decideSharedImportAutoRoute({ ...base, classification: null }).auto).toBe(false);
    });
});

describe('시트가 이 규칙을 쓴다', () => {
    const sheet = APP.split('async function openSharedImportSheetFlow(')[1].split('\n}\n')[0];
    const available = APP.split('async function isSharedImportTargetAvailable(')[1].split('\n}\n')[0];

    it('1.8초 제한을 쓰지 않는다', () => {
        expect(APP).not.toContain('SHARED_IMPORT_AUTO_ROUTE_WINDOW_MS');
        expect(sheet).toContain('decideSharedImportAutoRoute({');
    });

    it('시트를 만지면 자동으로 넣지 않는다', () => {
        const watch = APP.split('function bindSharedImportEngagementWatch() {')[1].split('\n}\n')[0];
        expect(watch).toContain('_sharedImportSession.userEngaged = true');
        expect(watch).toContain("'pointerdown'");
        expect(sheet).toContain('userEngaged: session.userEngaged');
    });

    it('자리를 확인하는 사이에 회원이 고르면 멈춘다', () => {
        const afterCheck = sheet.split('await isSharedImportTargetAvailable(')[1];
        expect(afterCheck).toContain('session.manuallyPicked) return;');
    });

    it('오늘 수면 사진이 있으면 바꿔 끼우지 않는다', () => {
        expect(available).toContain("if (category === 'sleep') return !hasVisibleStaticPreview(document.getElementById('preview-sleep'));");
    });

    // 식단 칸은 끼니 이름이 아니라 순서다(① 첫 번째 식사~). 다음 빈 칸이 넣을 곳.
    it('식단은 오늘 찍은 사진이고 빈 칸이 있을 때만', () => {
        expect(available).toContain('if (!captureInfo.matches) return false;');
        expect(available).toContain('return getEmptyDietSlots().length > 0;');
    });

    it('걸린 시간과 판단을 남긴다', () => {
        expect(sheet).toContain("console.info('[shared-import] 분류'");
        expect(sheet).toContain('elapsedMs,');
    });
});
