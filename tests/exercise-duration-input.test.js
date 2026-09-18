import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDailyActivityMinutes, resolveExerciseItemMinutes } from '../js/le8-score.js';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');
const APP_SOURCE = read('js/app-core.js');

// 2026-09-14 질문: "하이퍼랩스 영상도 AI가 읽고 운동량과 시간, 강도를 계산할 수 있나?"
// 종류·강도·자세는 읽을 수 있지만 시간은 원리적으로 불가능하다 — 하이퍼랩스는
// 시간을 지워 버린 영상이라 10초짜리 파일이 10분인지 한 시간인지 픽셀에 없다.
// 그래서 AI 에게 묻지 않고 사람에게 묻는다. 한 번 누른 값이 지어낸 값보다 낫다.
describe('the person supplies the minutes the photo cannot', () => {
    it('trusts what the user entered over anything the AI guessed', () => {
        const minutes = resolveExerciseItemMinutes({
            durationMinutes: 45,
            aiAnalysis: { intensity: '중강도', weightedMinutes: 30 }
        });
        expect(minutes).toBe(45);
    });

    it('still borrows the intensity from the AI to weight it', () => {
        // 고강도 20분은 중강도 40분에 해당한다(WHO).
        expect(resolveExerciseItemMinutes({
            durationMinutes: 20,
            aiAnalysis: { intensity: '고강도' }
        })).toBe(40);
        // 강도를 모르면 중강도로 본다 — 없는 판단을 지어내지 않는다.
        expect(resolveExerciseItemMinutes({ durationMinutes: 20 })).toBe(20);
        expect(resolveExerciseItemMinutes({
            durationMinutes: 20,
            aiAnalysis: { intensity: '저강도' }
        })).toBe(10);
    });

    it('falls back to what the AI read, then to the old estimate', () => {
        expect(resolveExerciseItemMinutes({ aiAnalysis: { weightedMinutes: 60 } })).toBe(60);
        expect(resolveExerciseItemMinutes({})).toBe(30);
        expect(resolveExerciseItemMinutes(null)).toBe(30);
    });

    it('does not let one entry claim the whole day', () => {
        expect(resolveExerciseItemMinutes({
            durationMinutes: 300,
            aiAnalysis: { intensity: '초고강도' }
        })).toBe(120);
    });

    it('ignores a blank or nonsense entry instead of counting it as zero', () => {
        expect(resolveExerciseItemMinutes({ durationMinutes: 0 })).toBe(30);
        expect(resolveExerciseItemMinutes({ durationMinutes: '' })).toBe(30);
        expect(resolveExerciseItemMinutes({ durationMinutes: -5 })).toBe(30);
    });

    it('reaches the weekly total through the same daily rule', () => {
        const day = resolveDailyActivityMinutes({
            exercise: { strengthList: [{ durationMinutes: 25, aiAnalysis: { intensity: '고강도' } }] }
        });
        expect(day.minutes).toBe(50);
        expect(day.hasSignal).toBe(true);
    });
});

describe('the duration field is asked for, saved, and brought back', () => {
    const app = read('js/app-core.js');

    it('sits on both photo and video blocks', () => {
        const fn = app.split('function addExerciseBlock(')[1].split('\n}\n')[0];
        expect(fn.split('${durationHtml}').length - 1).toBe(2);
        // upload-area label 안에 넣으면 누를 때마다 파일 선택창이 같이 열린다.
        const cardio = fn.split("contentHtml = `")[1].split('`;')[0];
        expect(cardio.indexOf('${durationHtml}')).toBeGreaterThan(cardio.indexOf('</label>'));
    });

    it('offers taps as well as typing', () => {
        expect(app).toContain('const EXERCISE_DURATION_PRESETS = [5, 10, 15, 30, 60];');
        expect(app).toContain('window.setExerciseDuration = function (chip, minutes)');
    });

    it('goes into the record so the weekly bar can read it', () => {
        const fn = app.split('function normalizeExerciseItem(')[1].split('\n}\n')[0];
        expect(fn.split('durationMinutes: normalizedDuration').length - 1).toBe(2);
        expect(fn).toContain('MAX_EXERCISE_DURATION_MINUTES');
        // 저장 시 두 블록 모두에서 읽어 간다.
        expect(app.split('durationMinutes: readExerciseDurationMinutes(block)').length - 1).toBe(2);
    });

    it('comes back filled when the record is reopened', () => {
        const fn = app.split('function buildExerciseDurationHtml(')[1].split('\n}\n')[0];
        expect(fn).toContain('data && data.durationMinutes');
        expect(fn).toContain('value="${value}"');
    });

    it('lets the AI fill a blank but never overwrite a person', () => {
        const fn = app.split('function prefillExerciseDurationFromAnalysis(')[1].split('\n}\n')[0];
        expect(fn).toContain("input.getAttribute('data-user-set') === 'true'");
        expect(fn).toContain('input.value');
        expect(fn).toContain('analysis.durationMinutes');
        // 분석이 끝난 자리에서 불린다.
        const analyze = app.split('window.analyzeExercisePhoto = async function (')[1].split('\n};\n')[0];
        expect(analyze).toContain('prefillExerciseDurationFromAnalysis(block, analysis);');
    });

    it('marks the field the moment a person touches it', () => {
        expect(app).toContain('window.markExerciseDurationEdited = function (input)');
        expect(app).toContain('oninput="markExerciseDurationEdited(this)"');
        expect(app).toContain("input.setAttribute('data-user-set', 'true');");
    });

    it('says what the number is for', () => {
        const fn = app.split('function buildExerciseDurationHtml(')[1].split('\n}\n')[0];
        expect(fn).toContain('이번 주 150분에 반영돼요');
        expect(fn).toContain('비워 두면 30분으로 잡아요');
    });

    it('has a look in both themes', () => {
        // 전역 input[type=number]{width:100%} 가 클래스 하나를 이긴다. 부모를 붙여 특이도를 올려야 한다.
        expect(read('styles-features.css')).toContain('.exercise-duration-row .exercise-duration-input {');
        // 칩은 그리드로 다섯 칸. flex-wrap 이면 좁은 화면에서 4 + 1 로 갈라진다.
        expect(read('styles-features.css')).toContain('grid-template-columns: repeat(5, 1fr);');
        expect(read('styles-features.css')).not.toContain(['', '.exercise-duration-input {'].join('\n'));
        expect(read('styles-dark-mode.css')).toContain('body.dark-mode .exercise-duration-row .exercise-duration-input');
    });
});

// 2026-09-19 제보: "운동 영상 올릴때 운동 시간 누르면 AI분석 끝나고 순차적으로
// 저장되게 해 줘. 지금은 동시에 저장이 안되는지 AI분석 실패로 나와."
//
// 영상을 올리면 분석이 저절로 시작된다. 그 사이에 저장을 누르면 저장 경로가
// 블록을 다시 그리고, 분석은 결과를 걸어 둘 자리를 잃는다. 결과가 기록에 실리지
// 못하고 화면에는 실패로 보인다.
describe('saving waits for an analysis that is still running', () => {
    it('counts the analyses that are in flight', () => {
        expect(APP_SOURCE).toContain('const _runningAiAnalyses = new Set();');
        expect(APP_SOURCE).toContain('function beginAiAnalysis()');
        // 영상과 사진 둘 다 등록한다 — 저장 경로가 같다.
        expect(APP_SOURCE.split('beginAiAnalysis()').length - 1).toBe(3);
    });

    it('waits before it starts saving, not after', () => {
        const save = APP_SOURCE.split("document.getElementById('saveDataBtn').addEventListener('click'")[1];
        const waitAt = save.indexOf('await waitForRunningAiAnalyses();');
        const writeAt = save.indexOf('selectedDateStr = document.getElementById');
        expect(waitAt).toBeGreaterThan(-1);
        expect(writeAt).toBeGreaterThan(waitAt);
    });

    it('does not wait forever', () => {
        // 분석이 멈춰도 저장까지 멈추면 기록을 잃는다.
        const fn = APP_SOURCE.split('async function waitForRunningAiAnalyses()')[1].split('\n}')[0];
        expect(fn).toContain('AI_ANALYSIS_SAVE_WAIT_MS');
        expect(fn).toContain('withAsyncTimeout(');
        expect(fn).toContain('catch');
    });

    it('says why the save is taking a moment', () => {
        const fn = APP_SOURCE.split('async function waitForRunningAiAnalyses()')[1].split('\n}')[0];
        expect(fn).toContain('AI 분석을 마치고 저장할게요');
    });

    it('releases its slot even when the analysis throws', () => {
        // finally 가 아니면 실패한 분석 하나가 그 뒤의 모든 저장을 25초씩 붙잡는다.
        const video = APP_SOURCE.split('window.analyzeExerciseVideo = async function')[1].split('\n};')[0];
        const finallyAt = video.indexOf('} finally {');
        const releaseAt = video.indexOf('endAnalysis();');
        expect(finallyAt).toBeGreaterThan(-1);
        expect(releaseAt).toBeGreaterThan(finallyAt);
    });
});

describe('the duration row is one thin line', () => {
    it('puts the label, the chips and the box on the same row', () => {
        const fn = APP_SOURCE.split('function buildExerciseDurationHtml(')[1].split('\n}\n')[0];
        const row = fn.split('exercise-duration-row')[1];
        for (const part of ['exercise-duration-label', 'exercise-duration-chips', 'exercise-duration-input']) {
            expect(row, part).toContain(part);
        }
    });

    it('shows which value is chosen', () => {
        // 누르고 나서 무엇을 골랐는지 화면이 말해 주지 않으면 같은 버튼을 두 번 누른다.
        expect(APP_SOURCE).toContain("el.classList.toggle('is-on', el === chip)");
        expect(read('styles-features.css')).toContain('.exercise-duration-chip.is-on {');
        expect(read('styles-dark-mode.css')).toContain('body.dark-mode .exercise-duration-chip.is-on');
    });

    it('drops the highlight when the number is typed over', () => {
        expect(APP_SOURCE).toContain('function syncExerciseDurationChips(input)');
        const edited = APP_SOURCE.split('window.markExerciseDurationEdited = function (input) {')[1].split('\n}')[0];
        expect(edited).toContain('syncExerciseDurationChips(input)');
    });
});
