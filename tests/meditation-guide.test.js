import { describe, expect, it } from 'vitest';
import { readAppSource, readRepoFile } from './source-helpers.js';
import {
    DEFAULT_MEDITATION_METHOD_ID,
    MEDITATION_METHOD_IDS,
    buildMeditationCompletionLabel,
    formatMeditationDurationLabel,
    getMeditationMethodMeta,
    getMeditationPhaseLine,
    listMeditationMethods,
    normalizeMeditationLog
} from '../js/meditation-guide.js';

const APP_SOURCE = readAppSource({ includeEntrypoint: true });
const INDEX_SOURCE = readRepoFile('index.html');

describe('meditation guide helpers', () => {
    it('keeps the agreed four meditation methods in order', () => {
        expect(listMeditationMethods().map((method) => method.id)).toEqual([
            MEDITATION_METHOD_IDS.ABDOMINAL,
            MEDITATION_METHOD_IDS.FOUR_SEVEN_EIGHT,
            MEDITATION_METHOD_IDS.BOX,
            MEDITATION_METHOD_IDS.MINDFULNESS
        ]);
        expect(getMeditationMethodMeta(DEFAULT_MEDITATION_METHOD_ID).durationSec).toBe(180);
        expect(formatMeditationDurationLabel(300)).toBe('5분');
    });

    it('keeps legacy meditation logs blank for method and duration', () => {
        expect(normalizeMeditationLog({
            meditationDone: true
        })).toEqual({
            meditationDone: true,
            meditationMethodId: '',
            meditationDurationSec: 0,
            meditationCompletedAt: ''
        });
        expect(buildMeditationCompletionLabel({
            meditationDone: true
        })).toBe('오늘 명상 완료');
    });

    it('builds explicit completion labels and phase prompts for guided sessions', () => {
        expect(buildMeditationCompletionLabel({
            meditationDone: true,
            meditationMethodId: MEDITATION_METHOD_IDS.ABDOMINAL,
            meditationDurationSec: 180
        })).toBe('오늘 명상 완료 · 복식호흡 · 3분');

        expect(getMeditationPhaseLine(MEDITATION_METHOD_IDS.FOUR_SEVEN_EIGHT, {
            elapsedSec: 5,
            remainingSec: 60,
            totalSec: 120
        })).toBe('숨을 멈추고 가슴을 편하게 둬요.');

        expect(getMeditationPhaseLine(MEDITATION_METHOD_IDS.MINDFULNESS, {
            elapsedSec: 220,
            remainingSec: 80,
            totalSec: 300
        })).toBe('떠오른 생각은 흘려보내고 다시 호흡으로 돌아와요.');
    });

    it('replaces the checkbox flow with guided meditation UI and metadata saves', () => {
        expect(APP_SOURCE).toContain('meditationMethodId');
        expect(APP_SOURCE).toContain('meditationDurationSec');
        expect(APP_SOURCE).toContain('meditationCompletedAt');
        expect(APP_SOURCE).toContain('const selectedDateStr = String(dateStr || todayStr).trim() || todayStr;');
        expect(APP_SOURCE).toContain('window.startMeditationSession = function()');
        expect(APP_SOURCE).toContain('window.pauseMeditationSession = function()');
        expect(APP_SOURCE).toContain('window.resumeMeditationSession = function()');
        expect(APP_SOURCE).toContain('window.cancelMeditationSession = function()');
        expect(APP_SOURCE).not.toContain('meditation-check');

        expect(INDEX_SOURCE).toContain('id="meditation-method-chip-list"');
        expect(INDEX_SOURCE).toContain('id="meditation-start-btn"');
        expect(INDEX_SOURCE).toContain('id="meditation-completion-line"');
    });
});
