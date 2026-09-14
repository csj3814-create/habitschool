import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');

// 2026-09-14 질문: "사진을 지우면 AI 분석도 함께 지워지나?"
// 화면에서는 지워지고 있었다. 서버에서는 아니었다. 분석은 저장 버튼 없이 그 자리에서
// 기록에 들어가는데(자동 분석이면 누른 적도 없다), 지우는 쪽은 저장 버튼을 눌러야
// 반영됐고 그나마도 merge 저장이라 키를 빼는 방식이어서 영영 안 지워졌다.
describe('an analysis lives and dies with the photo it read', () => {
    const app = read('js/app-core.js');

    it('writes null for an empty slot instead of leaving the key out', () => {
        // merge 저장에서 키를 빼면 서버에 남은 값은 그대로 살아남는다.
        const fn = app.split('function collectCurrentDietAnalysisFromUi(')[1].split('\n}\n')[0];
        expect(fn).toContain("dietAnalysis[meal] = (analysis && typeof analysis === 'object') ? analysis : null;");
        expect(fn).not.toContain('if (analysis && typeof analysis === \'object\') {\n            dietAnalysis[meal] = analysis;');
    });

    it('drops a result whose photo left while the analysis was running', () => {
        const fn = app.split('function isAnalyzedPhotoStillInPlace(')[1].split('\n}\n')[0];
        expect(fn).toContain("previewEl.hasAttribute('data-user-removed')");
        expect(fn).toContain("previewEl.style.display === 'none'");
        // 같은 자리에 다른 사진이 올라온 경우도 잡아야 한다.
        expect(fn).toContain('_pendingUploads.get(inputId)?.result?.url');

        const meal = app.split('async function analyzeMealPhoto(')[1].split('\n};\n')[0];
        expect(meal).toContain('if (!isAnalyzedPhotoStillInPlace(previewImg, findAiAnalysisInputIdForSlot(meal), imageUrl)) return;');

        const sleep = app.split('window.analyzeSleepData = async function(')[1].split('\n};\n')[0];
        expect(sleep).toContain("if (!isAnalyzedPhotoStillInPlace(previewEl, findAiAnalysisInputIdForSlot('sleep'), sleepUrl)) return;");
    });

    it('keeps the check tolerant when there is no uploaded URL to compare', () => {
        // 로컬 이미지를 압축해 그대로 보낸 경우엔 대조할 URL 이 없다.
        const fn = app.split('function isAnalyzedPhotoStillInPlace(')[1].split('\n}\n')[0];
        expect(fn).toContain('if (!target || !isPersistedStorageUrl(target)) return true;');
    });

    it('remembers only what went to the server without a save', () => {
        // 예전에 저장해 둔 사진까지 즉시 지우면 '저장 버튼이 확정한다'가 깨진다.
        expect(app).toContain('const _analysisPersistedWithoutSave = new Map();');
        expect(app).toContain('noteAnalysisPersistedWithoutSave(meal, docId);');
        expect(app).toContain("noteAnalysisPersistedWithoutSave('sleep', docId);");
    });

    it('clears the note once the server is the truth again', () => {
        // 저장 ACK 두 경로 + 기록 재조회. 날짜가 바뀐 뒤에도 남아 있으면
        // 어제 문서를 오늘 삭제로 건드린다.
        expect(app.split('forgetAnalysisPersistedWithoutSave();').length - 1).toBe(3);
        const load = app.split('async function loadDataForSelectedDate(')[1].split('\n    try {')[0];
        expect(load).toContain('forgetAnalysisPersistedWithoutSave();');
    });

    it('erases the record the analysis wrote when the photo is deleted', () => {
        const remove = app.split('window.removeStaticImage = function (')[1].split('\n};\n')[0];
        expect(remove).toContain('discardAnalysisPersistedWithoutSave(meal);');
        // 수면 버튼의 분석 완료 표식도 같이 내린다.
        expect(remove).toContain("aiBtn.removeAttribute('data-analyzed');");

        const fn = app.split('async function discardAnalysisPersistedWithoutSave(')[1].split('\n}\n')[0];
        // 분석만 지우고 사진 URL 을 두면 포인트 증빙으로 계속 잡힌다.
        expect(fn).toContain('patch.diet = { [urlKey]: null, [thumbKey]: null };');
        expect(fn).toContain('patch.dietAnalysis = { [normalizedSlot]: null };');
        expect(fn).toContain('sleepImageUrl: null');
        expect(fn).toContain('sleepAnalysis: null');
        // isValidDailyLog 는 지우는 쓰기에도 userId·date 를 요구한다.
        expect(fn).toContain('userId: user.uid');
        expect(fn).toContain("date: String(docId).split('_').slice(1).join('_')");
        // 조용히 실패하면 지운 줄 알았던 분석이 남는다.
        expect(fn).toContain('console.error(');
    });

    it('scores never count an analysis whose photo is gone', () => {
        // 서버 쪽은 이미 사진 유무로 걸러진다 — 화면 점수만 남아 있었다.
        expect(read('functions/gallery-posts.js')).toContain('if (!diet[`${slot}Url`]) continue;');
        // null 로 적어 두면 아래 두 계산이 모두 걸러낸다.
        expect(read('js/le8-score.js')).toContain('if (!a || DIET_GRADE_POINTS[a.grade] === undefined) return;');
        expect(read('js/metabolic-score.js')).toContain('.filter(a => a && a.grade)');
    });
});
