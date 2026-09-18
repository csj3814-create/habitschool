import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectAdminDailyLogAnalyses } from '../js/admin-utils.js';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');
const app = read('js/app-core.js');
const gallery = read('functions/gallery-posts.js');

// 2026-09-15 점검: "자동 AI 판독과 운동 시간 적립이 다른 화면과 잘 연계되는지"
// 세 군데가 끊겨 있었다. 만든 쪽만 보고 받는 쪽을 안 본 결과다.
describe('the exercise analysis reaches the screens that show it', () => {
    describe('갤러리 — 서버가 분석을 실어 보내지 않고 있었다', () => {
        it('projects the analysis alongside the media', () => {
            // 식단은 normalizeDietAnalysis 로 내보내는데 운동만 빠져 있었다. 그래서
            // 화면의 '분석 확인' 버튼 코드가 있어도 운동 사진에는 영영 뜨지 않았다.
            const fn = gallery.split('function normalizeExerciseList(')[1].split('\n}\n')[0];
            expect(fn).toContain('normalizeExerciseAnalysisEntry(source.aiAnalysis)');
            expect(fn).toContain('item.aiAnalysis = analysis');
        });

        it('sends only the fields the screen draws, not the raw object', () => {
            const fn = gallery.split('function normalizeExerciseAnalysisEntry(')[1].split('\n}\n')[0];
            for (const field of ['intensity', 'exerciseType', 'timeAnalysis', 'feedback', 'formTip', 'weightedMinutes']) {
                expect(fn, field).toContain(field);
            }
            // 2026-09-19: 반복 횟수는 싣지 않는다. 하이퍼랩스에서 센 숫자가
            // 실제와 크게 어긋났다(70회 → 3회).
            expect(fn).not.toContain('repCount');
            // 화면은 intensity 로 색을 고른다. 낯선 낱말이 오면 색이 통째로 빠진다.
            expect(gallery).toContain('const EXERCISE_INTENSITY_WORDS = ["저강도", "중강도", "고강도", "초고강도"];');
            expect(fn).toContain('EXERCISE_INTENSITY_WORDS.includes(intensity)');
        });

        it('keeps a "not a workout" verdict off the public wall', () => {
            // 남들에게 보이는 자리다. 운동이 아니라고 판정된 것까지 내보낼 이유가 없다.
            const fn = gallery.split('function normalizeExerciseAnalysisEntry(')[1].split('\n}\n')[0];
            expect(fn).toContain('if (raw.isExercise === false) return null;');
        });
    });

    describe('갤러리 — 영상은 분석을 받을 자리조차 없었다', () => {
        it('gives a video card the same overlay a photo card gets', () => {
            // 자세와 강도는 영상에서만 나오는데 정작 갤러리에서 볼 수 없었다.
            const fn = app.split('const addVid = (url, thumbUrl, aiAnalysis) => {')[1].split('\n        };\n')[0];
            expect(fn).toContain('const hasAi = aiAnalysis != null;');
            expect(fn).toContain('data-ai-analysis=');
            expect(fn).toContain('toggleGalleryAiOverlay(this)');
            expect(fn).toContain('gallery-ai-overlay');
        });

        it('passes the stored analysis in from both lists', () => {
            expect(app).toContain('data.exercise.cardioList.forEach(c => addImg(c.imageUrl, c.imageThumbUrl, c.aiAnalysis))');
            expect(app).toContain('data.exercise.strengthList.forEach(s => addVid(s.videoUrl, s.videoThumbUrl, s.aiAnalysis))');
        });

        it('routes an exercise analysis to the exercise renderer', () => {
            // 오버레이는 모양으로 어느 분석인지 가른다. intensity 가 그 표식이다.
            const overlay = app.split('window.toggleGalleryAiOverlay = function (btnEl) {')[1].split('\n};\n')[0];
            expect(overlay).toContain('renderExerciseAnalysisResult(analysis, overlay)');
            expect(overlay).toContain('analysis.intensity || analysis.exerciseType');
        });
    });

    describe('관제탑 — 없어진 자를 읽고 새 자를 못 읽었다', () => {
        const log = {
            exercise: {
                strengthList: [{
                    videoUrl: 'https://x/y',
                    durationMinutes: 25,
                    aiAnalysis: {
                        isExercise: true,
                        intensity: '고강도',
                        exerciseType: '데드리프트',
                        weightedMinutes: null,
                        feedback: '좋습니다',
                        formTip: '허리를 펴세요'
                    }
                }]
            }
        };

        it('shows the minutes the member actually typed', () => {
            // 주간 활동분의 실제 입력이 이 값인데 관제탑에서 볼 수 없었다.
            const [entry] = collectAdminDailyLogAnalyses(log);
            const labels = entry.fields.map((f) => f.label);
            expect(labels).toContain('적은 운동 시간');
            const minutes = entry.fields.find((f) => f.label === '적은 운동 시간');
            expect(minutes.value).toContain('25');
        });

        it('shows what the new analysis actually carries', () => {
            const [entry] = collectAdminDailyLogAnalyses(log);
            const labels = entry.fields.map((f) => f.label);
            for (const label of ['강도', '운동 종류', '피드백', '자세 팁']) {
                expect(labels, label).toContain(label);
            }
        });

        it('no longer reads the ruler that was removed', () => {
            // 2026-09-14 에 '하루 30분' 자를 없앴는데 관제탑만 그것을 읽고 있었다.
            expect(read('js/admin-utils.js')).not.toContain('recommendedDailyProgress');
        });

        it('explains a record that will not count', () => {
            // "왜 점수에 안 잡히죠" 라는 제보가 여기서 풀린다.
            const [entry] = collectAdminDailyLogAnalyses({
                exercise: { cardioList: [{ imageUrl: 'https://x/y', aiAnalysis: { isExercise: false, feedback: '음식 사진입니다' } }] }
            });
            const verdict = entry.fields.find((f) => f.label === '판정');
            expect(verdict?.value).toContain('운동으로 보이지 않음');
        });

        it('still shows a record that has minutes but no analysis', () => {
            const [entry] = collectAdminDailyLogAnalyses({
                exercise: { cardioList: [{ imageUrl: 'https://x/y', durationMinutes: 40 }] }
            });
            expect(entry.fields.find((f) => f.label === '적은 운동 시간').value).toContain('40');
        });
    });
});
