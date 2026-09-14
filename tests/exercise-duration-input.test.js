import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDailyActivityMinutes, resolveExerciseItemMinutes } from '../js/le8-score.js';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');

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
        expect(app).toContain('const EXERCISE_DURATION_PRESETS = [10, 20, 30, 45, 60];');
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
        expect(fn).toContain('비워 두면 기록 하나당 30분으로 잡아요');
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
