import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

const app = readRepoFile('js/app-core.js');
const html = readRepoFile('index.html');

function loadNudge({ uid = 'me', photos = [] } = {}) {
    const start = app.indexOf("let _firstRecordNudgeUid = '';");
    const end = app.indexOf('function updateRecordFlowGuides(', start);
    expect(start).toBeGreaterThan(-1);
    const text = () => ({ textContent: '', setAttribute() {} });
    const nudge = { hidden: true, dataset: {}, querySelector: text };
    // eslint-disable-next-line no-new-func
    const sync = new Function(
        'document', 'auth', '_hasPreviewImage', 'hasStartedRecording', 't', 'getDocs',
        `const DIET_SLOTS = Object.freeze(['breakfast', 'lunch', 'dinner', 'snack', 'meal5', 'meal6']);\n${app.slice(start, end)}\nreturn syncFirstRecordNudge;`
    )(
        { getElementById: (id) => (id === 'diet-first-record-nudge' ? nudge : null) },
        { currentUser: uid ? { uid } : null },
        (id) => photos.includes(id),
        (data) => !!data.lastLogDate,
        (key) => key,
        // 기록한 적 있는 회원은 기록 문서를 읽어 하루뿐인지 본다 — 여기서는 읽기를 실패시켜 상자가 숨은 채 남는지만 본다.
        () => Promise.reject(new Error('offline'))
    );
    return { nudge, sync };
}

// 2026-11-07 대표 요청: 첫 기록 전 회원에게 "다음 식사 기다리지 말고 지금 찍어 올려 보라" 고 권한다.
describe('식단 탭 첫 기록 권유', () => {
    it('기록한 적 없는 회원에게 보인다', () => {
        const { nudge, sync } = loadNudge();
        sync('me', {});
        expect(nudge.hidden).toBe(false);
    });

    it('기록한 적 있는 회원에게는 안 보인다', () => {
        const { nudge, sync } = loadNudge();
        sync('me', { lastLogDate: '2026-11-01' });
        expect(nudge.hidden).toBe(true);
    });

    it('사진을 고르면 숨는다', () => {
        const { nudge, sync } = loadNudge({ photos: ['preview-breakfast'] });
        sync('me', {});
        expect(nudge.hidden).toBe(true);
    });

    it('다른 계정으로 바뀌면 안 보인다', () => {
        const { nudge, sync } = loadNudge({ uid: 'other' });
        sync('me', {});
        expect(nudge.hidden).toBe(true);
    });

    it('처음에는 숨겨져 있어 서버 확인 전에 기존 회원에게 비치지 않는다', () => {
        expect(html).toMatch(/id="diet-first-record-nudge"[^>]*\shidden/);
    });

    it('회원 문서를 읽은 뒤와 저장 성공 뒤에 다시 판단한다', () => {
        expect(app).toContain('syncFirstRecordNudge(user.uid, userData);');
        const save = app.indexOf("trackFirstRecordStep('first_record_save_ok'");
        expect(app.slice(save, save + 200)).toContain("_firstRecordNudgeUid = '';");
    });
});
