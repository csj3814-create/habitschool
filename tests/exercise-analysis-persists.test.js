import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(resolve(ROOT_DIR, 'js/app-core.js'), 'utf8');
const NL = String.fromCharCode(10);

const sliceFn = (start, end) => {
    const from = APP.indexOf(start);
    const to = APP.indexOf(end, from);
    expect(from).toBeGreaterThanOrEqual(0);
    expect(to).toBeGreaterThan(from);
    return APP.slice(from, to);
};

// 2026-09-21 지시: "근본적으로 해결해줘."
//
// 사흘 동안 같은 자리에서 세 번 걸렸다(tasks/lessons.md 262). 원인은 하나 —
// 운동 분석 결과가 화면(data-ai-analysis)에만 있고 서버에 없었다. 식단·수면은
// 그 자리에서 들어가는데 운동만 저장 버튼을 기다렸고, 그래서 화면을 다시 그리는
// 모든 경로가 지우개였다.
describe('an exercise analysis goes to the server the moment it exists', () => {
    it('is written right after it is attached to the block', () => {
        // 영상과 사진 둘 다.
        expect(APP.split('persistExerciseAnalysisNow(block, analysis)').length - 1).toBe(3);
        for (const marker of ['window.analyzeExerciseVideo = async function', 'window.analyzeExercisePhoto = async function']) {
            const fn = APP.split(marker)[1].split(NL + '};')[0];
            const attachAt = fn.indexOf("block.setAttribute('data-ai-analysis'");
            const persistAt = fn.indexOf('persistExerciseAnalysisNow(block, analysis)');
            expect(attachAt, marker).toBeGreaterThan(-1);
            expect(persistAt, marker).toBeGreaterThan(attachAt);
        }
    });

    it('uses a transaction, because two analyses can land at once', () => {
        // merge 로는 배열의 한 항목만 고칠 수 없다. 읽고-고치고-쓰기를 묶지 않으면
        // 나중 쓰기가 앞의 분석을 지운다.
        const fn = sliceFn('async function writeExerciseListSnapshot(', 'async function persistExerciseAnalysisNow(');
        expect(fn).toContain('await runTransaction(db, async (tx) => {');
        expect(fn).toContain('const snap = await tx.get(ref);');
        expect(APP).toContain('arrayRemove, arrayUnion, runTransaction');
    });

    it('merges with the same rule the save button uses', () => {
        // 규칙을 두 벌로 만들면 갈라진다. mediaId 로 짝을 맞추고 지운 것을 거른다.
        const fn = sliceFn('async function writeExerciseListSnapshot(', 'async function persistExerciseAnalysisNow(');
        expect(fn).toContain('mergeExerciseItems(type, serverList,');
    });

    it('carries userId and date, or the day’s first write is refused', () => {
        const fn = sliceFn('async function writeExerciseListSnapshot(', 'async function persistExerciseAnalysisNow(');
        expect(fn).toContain('userId: user.uid,');
        expect(fn).toContain('date: dateStr,');
    });

    it('touches only that one list', () => {
        // exercise 를 통째로 쓰면 반대쪽 목록(유산소/근력)이 날아간다.
        const fn = sliceFn('async function writeExerciseListSnapshot(', 'async function persistExerciseAnalysisNow(');
        expect(fn).toContain('exercise: { [listKey]: merged },');
        expect(fn).toContain('{ merge: true }');
    });

    it('waits for a real upload before writing anything', () => {
        // 아직 올라가는 중이면 주소가 없다. 빈 항목을 만들지 않는다.
        const fn = sliceFn('async function persistExerciseAnalysisNow(', 'function discardPersistedExerciseAnalysis(');
        expect(fn).toContain('if (!mediaId || !isPersistedStorageUrl(mediaUrl)) return;');
    });

    it('keeps the analysis on screen when the write fails', () => {
        const fn = sliceFn('async function persistExerciseAnalysisNow(', 'function discardPersistedExerciseAnalysis(');
        expect(fn).toContain('catch');
        expect(fn).toContain("console.warn('[운동 분석] 즉시 저장 실패:'");
        // 실패했다고 화면의 결과를 지우지는 않는다.
        expect(fn).not.toContain("removeAttribute('data-ai-analysis')");
    });
});

// 즉시 저장을 넣으면 반드시 같이 와야 하는 짝이다. 2026-09-14 에 식단에서 고쳤던
// 버그("사진을 지워도 분석이 기록에 남아 점수에 반영") 를 운동에 새로 만들지
// 않으려면, 지우는 쪽도 그 자리에서 서버를 고쳐야 한다.
describe('deleting the media takes the analysis with it', () => {
    it('cleans the server when the block is removed', () => {
        const fn = sliceFn('window.removeExerciseBlock = function(block) {', NL + '};');
        expect(fn).toContain('discardPersistedExerciseAnalysis(type, mediaId);');
        // 지운 목록에 넣는 것과 같은 자리에서 한다.
        expect(fn.indexOf('_removedExerciseMediaIds[type].add(mediaId)'))
            .toBeLessThan(fn.indexOf('discardPersistedExerciseAnalysis(type, mediaId)'));
    });

    it('cleans it from the preview delete path too', () => {
        expect(APP).toContain('discardPersistedExerciseAnalysis(exerciseType, mediaId);');
    });

    it('only cleans what it actually wrote', () => {
        // 저장 버튼으로 들어간 예전 기록까지 즉시 지우면 '저장이 확정한다' 는
        // 규칙이 깨진다.
        const fn = sliceFn('function discardPersistedExerciseAnalysis(', 'async function persistAnalyzedDietPhotoAndResult(');
        expect(fn).toContain('const docId = _persistedExerciseAnalyses.get(key);');
        expect(fn).toContain('if (!docId) return;');
    });

    it('lets the merge rule do the removing', () => {
        // 지운 mediaId 는 _removedExerciseMediaIds 에 있으므로, 새 항목 없이
        // 다시 쓰면 그것만 빠진다.
        const fn = sliceFn('function discardPersistedExerciseAnalysis(', 'async function persistAnalyzedDietPhotoAndResult(');
        expect(fn).toContain('writeExerciseListSnapshot({ user, docId, dateStr, type })');
    });

    it('forgets its notes once a real save lands', () => {
        const fn = sliceFn('function forgetAnalysisPersistedWithoutSave() {', NL + '}');
        expect(fn).toContain('_persistedExerciseAnalyses.clear();');
    });
});

// 실제로 합쳐지는지 — 규칙만 보지 않고 돌려 본다.
describe('the merge keeps other videos intact', () => {
    const harness = () => {
        const body = sliceFn('async function writeExerciseListSnapshot(', 'async function persistExerciseAnalysisNow(');
        const written = [];
        const tx = {
            get: async () => ({
                exists: () => true,
                data: () => ({
                    exercise: {
                        strengthList: [
                            { mediaId: 'a', videoUrl: 'https://x/a.mp4', aiAnalysis: { intensity: '중강도' }, durationMinutes: 20 },
                            { mediaId: 'b', videoUrl: 'https://x/b.mp4', aiAnalysis: null, durationMinutes: null },
                        ],
                        cardioList: [{ mediaId: 'c', imageUrl: 'https://x/c.jpg' }],
                    },
                }),
            }),
            set: (ref, value) => written.push(value),
        };
        const run = Function(
            'db', 'doc', 'runTransaction', 'serverTimestamp', 'mergeExerciseItems', 'getExerciseListKey',
            `${body}
            return writeExerciseListSnapshot;`
        )(
            {},
            () => ({ path: 'daily_logs/u1_2026-09-21' }),
            async (_db, fn) => fn(tx),
            () => 'TS',
            // 저장 경로와 같은 함수를 소스에서 떼어 쓴다.
            Function(
                'normalizeExerciseItem', '_removedExerciseMediaIds',
                `${sliceFn('function mergeExerciseItems(', NL + '}')}
                }
                return mergeExerciseItems;`
            )(
                Function(
                    'getExerciseItemMediaId', 'hasMediaUrl', 'MAX_EXERCISE_DURATION_MINUTES',
                    `${sliceFn('function normalizeExerciseItem(', NL + '}')}
                    }
                    return normalizeExerciseItem;`
                )(
                    (type, item) => String(item?.mediaId || ''),
                    (v) => !!String(v || '').trim(),
                    300
                ),
                { cardio: new Set(), strength: new Set() }
            ),
            (type) => (type === 'cardio' ? 'cardioList' : 'strengthList')
        );
        return { run, written };
    };

    it('adds the new analysis without dropping the other item', async () => {
        const { run, written } = harness();
        await run({
            user: { uid: 'u1' }, docId: 'u1_2026-09-21', dateStr: '2026-09-21', type: 'strength',
            incomingItem: { mediaId: 'b', videoUrl: 'https://x/b.mp4', aiAnalysis: { intensity: '고강도' }, durationMinutes: 15 },
        });
        const list = written[0].exercise.strengthList;
        expect(list).toHaveLength(2);
        expect(list.find((i) => i.mediaId === 'a').aiAnalysis).toEqual({ intensity: '중강도' });
        expect(list.find((i) => i.mediaId === 'b').aiAnalysis).toEqual({ intensity: '고강도' });
        expect(list.find((i) => i.mediaId === 'b').durationMinutes).toBe(15);
    });

    it('does not write the other list at all', async () => {
        const { run, written } = harness();
        await run({
            user: { uid: 'u1' }, docId: 'u1_2026-09-21', dateStr: '2026-09-21', type: 'strength',
            incomingItem: { mediaId: 'b', videoUrl: 'https://x/b.mp4', aiAnalysis: { intensity: '고강도' } },
        });
        expect(written[0].exercise.cardioList).toBeUndefined();
        expect(written[0].userId).toBe('u1');
        expect(written[0].date).toBe('2026-09-21');
    });
});
