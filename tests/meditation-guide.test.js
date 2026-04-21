import { describe, expect, it } from 'vitest';
import { readAppSource, readRepoFile } from './source-helpers.js';
import {
    DEFAULT_MEDITATION_METHOD_ID,
    MEDITATION_METHOD_IDS,
    buildMeditationCompletionLabel,
    formatMeditationDurationLabel,
    getMeditationMethodMeta,
    getMeditationPhaseLine,
    getMeditationPhaseUiState,
    listMeditationMethods,
    normalizeMeditationLog
} from '../js/meditation-guide.js';

const APP_SOURCE = readAppSource({ includeEntrypoint: true });
const INDEX_SOURCE = readRepoFile('index.html');
const FIREBASE_JSON = readRepoFile('firebase.json');

describe('meditation guide helpers', () => {
    it('keeps the agreed four meditation methods in order and duration', () => {
        expect(listMeditationMethods().map((method) => method.id)).toEqual([
            MEDITATION_METHOD_IDS.ABDOMINAL,
            MEDITATION_METHOD_IDS.FOUR_SEVEN_EIGHT,
            MEDITATION_METHOD_IDS.BOX,
            MEDITATION_METHOD_IDS.MINDFULNESS
        ]);

        expect(getMeditationMethodMeta(DEFAULT_MEDITATION_METHOD_ID).durationSec).toBe(180);
        expect(getMeditationMethodMeta(MEDITATION_METHOD_IDS.FOUR_SEVEN_EIGHT).durationSec).toBe(180);
        expect(getMeditationMethodMeta(MEDITATION_METHOD_IDS.BOX).durationSec).toBe(180);
        expect(getMeditationMethodMeta(MEDITATION_METHOD_IDS.MINDFULNESS).durationSec).toBe(300);

        expect(getMeditationMethodMeta(MEDITATION_METHOD_IDS.ABDOMINAL).guide).toBe('배를 부풀리며 4초 들이쉼, 6초 내쉼');
        expect(getMeditationMethodMeta(MEDITATION_METHOD_IDS.ABDOMINAL).phaseSteps[0]).toEqual(
            expect.objectContaining({ label: '들이쉼', seconds: 4, visual: 'inhale' })
        );
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

    it('builds explicit completion labels and breathing phase prompts', () => {
        expect(buildMeditationCompletionLabel({
            meditationDone: true,
            meditationMethodId: MEDITATION_METHOD_IDS.ABDOMINAL,
            meditationDurationSec: 180
        })).toBe('오늘 명상 완료 · 복식호흡 · 3분');

        expect(getMeditationPhaseLine(MEDITATION_METHOD_IDS.FOUR_SEVEN_EIGHT, {
            elapsedSec: 5,
            remainingSec: 60,
            totalSec: 180
        })).toBe('숨을 멈추고 가슴을 편하게 둬요.');

        expect(getMeditationMethodMeta(MEDITATION_METHOD_IDS.FOUR_SEVEN_EIGHT).phaseSteps[1]).toEqual(
            expect.objectContaining({ label: '멈춤', seconds: 7, visual: 'hold-full' })
        );

        expect(getMeditationPhaseLine(MEDITATION_METHOD_IDS.MINDFULNESS, {
            elapsedSec: 220,
            remainingSec: 80,
            totalSec: 300
        })).toBe('떠오른 생각은 흘려보내고 다시 호흡으로 돌아와요.');

        expect(getMeditationPhaseUiState(MEDITATION_METHOD_IDS.BOX, {
            elapsedSec: 5,
            remainingSec: 175,
            totalSec: 180
        })).toEqual({
            steps: [
                expect.objectContaining({ label: '들이쉼', seconds: 4, visual: 'inhale' }),
                expect.objectContaining({ label: '멈춤', seconds: 4, visual: 'hold-full' }),
                expect.objectContaining({ label: '내쉼', seconds: 4, visual: 'exhale' }),
                expect.objectContaining({ label: '멈춤', seconds: 4, visual: 'hold-empty' })
            ],
            activeIndex: 1,
            cycleIndex: 0,
            activeProgress: 0.25,
            activeElapsedSec: 1,
            activeStepSeconds: 4
        });
    });

    it('renders guided meditation UI with sound controls, timed steps, and breathing visuals', () => {
        expect(APP_SOURCE).toContain('meditationMethodId');
        expect(APP_SOURCE).toContain('meditationDurationSec');
        expect(APP_SOURCE).toContain('meditationCompletedAt');
        expect(APP_SOURCE).toContain("const MEDITATION_SOUND_STORAGE_KEY = 'habitschool-meditation-sound-v1';");
        expect(APP_SOURCE).toContain("const MEDITATION_VIDEO_STORAGE_KEY = 'habitschool-mindfulness-video-v1';");
        expect(APP_SOURCE).toContain("const MEDITATION_VIDEO_RANDOM_START_MAX_SEC = 240;");
        expect(APP_SOURCE).toContain('const selectedDateStr = String(dateStr || todayStr).trim() || todayStr;');
        expect(APP_SOURCE).toContain('getMeditationPhaseUiState');
        expect(APP_SOURCE).toContain('window.startMeditationSession = function()');
        expect(APP_SOURCE).toContain('window.pauseMeditationSession = function()');
        expect(APP_SOURCE).toContain('window.resumeMeditationSession = function()');
        expect(APP_SOURCE).toContain('window.cancelMeditationSession = function()');
        expect(APP_SOURCE).toContain('window.toggleMeditationSound = function()');
        expect(APP_SOURCE).toContain('window.selectMeditationVideo = function(videoId = \'\')');
        expect(APP_SOURCE).toContain('function getGratitudeSpeechRecognitionCtor()');
        expect(APP_SOURCE).toContain('window.toggleGratitudeVoiceInput = function()');
        expect(APP_SOURCE).toContain("return window.SpeechRecognition || window.webkitSpeechRecognition || null;");
        expect(APP_SOURCE).toContain("const GRATITUDE_VOICE_MAX_LENGTH = 500;");
        expect(APP_SOURCE).toContain('async function openMindfulnessFullscreenExperience()');
        expect(APP_SOURCE).toContain('function closeMindfulnessFullscreenExperience()');
        expect(APP_SOURCE).toContain('function renderMindfulnessVideoChips(');
        expect(APP_SOURCE).toContain('function getMindfulnessVideoStartSec(');
        expect(APP_SOURCE).toContain('function renderMeditationPhaseSteps(');
        expect(APP_SOURCE).toContain('phaseStepsEl.dataset.signature !== signature');
        expect(APP_SOURCE).toContain("node.style.setProperty('--phase-fill'");
        expect(APP_SOURCE).toContain("node.style.setProperty('--phase-transition-duration'");
        expect(APP_SOURCE).toContain('function getMeditationPhaseTargetFill(');
        expect(APP_SOURCE).toContain('style="--phase-seconds:${Math.max(1, Number(step.seconds || 0))}s;"');
        expect(APP_SOURCE).toContain('class="meditation-phase-time"');
        expect(APP_SOURCE).not.toContain('meditation-check');

        expect(INDEX_SOURCE).toContain('id="meditation-method-chip-list"');
        expect(INDEX_SOURCE).toContain('id="meditation-sound-toggle"');
        expect(INDEX_SOURCE).toContain('id="meditation-phase-steps"');
        expect(INDEX_SOURCE).toContain('명상하며 느낀 3줄 감사 일기');
        expect(INDEX_SOURCE).toContain('id="gratitude-voice-btn"');
        expect(INDEX_SOURCE).toContain('id="gratitude-voice-status"');
        expect(INDEX_SOURCE).toContain('.meditation-journal-voice-btn');
        expect(INDEX_SOURCE).toContain('.meditation-journal-status');
        expect(INDEX_SOURCE).toContain('id="meditation-mindfulness-video"');
        expect(INDEX_SOURCE).toContain('id="meditation-video-chip-list"');
        expect(INDEX_SOURCE).toContain('id="meditation-mindfulness-iframe"');
        expect(INDEX_SOURCE).toContain('.meditation-mindfulness-video[hidden]');
        expect(INDEX_SOURCE).toContain('배를 부풀리며 4초 들이쉼, 6초 내쉼');
        expect(INDEX_SOURCE).toContain('.meditation-video-chip');
        expect(INDEX_SOURCE).toContain('.meditation-phase-visual');
        expect(INDEX_SOURCE).toContain('.meditation-phase-time');
        expect(INDEX_SOURCE).toContain('transform: scaleY(var(--phase-fill, 0))');
        expect(INDEX_SOURCE).toContain('transition: transform var(--phase-transition-duration, 0.92s) linear');
        expect(INDEX_SOURCE).toContain('animation: meditation-water-ripple 1.6s ease-in-out infinite');
        expect(INDEX_SOURCE).toContain('@keyframes meditation-water-ripple');
        expect(APP_SOURCE).toContain("videoId: 'Zr_nvOU8dd0'");
        expect(APP_SOURCE).toContain("videoId: 'VNu15Qqomt8'");
        expect(APP_SOURCE).toContain("videoId: '0ZAH8NUMNDQ'");
        expect(APP_SOURCE).toContain("videoId: 'sebYYzRiHqE'");
        expect(INDEX_SOURCE).toContain('youtube-nocookie.com/embed/Zr_nvOU8dd0?rel=0&playsinline=1');
        expect(FIREBASE_JSON).toContain('https://www.youtube-nocookie.com');
        expect(FIREBASE_JSON).toContain('https://*.ytimg.com');
    });
});
