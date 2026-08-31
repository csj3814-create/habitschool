import { describe, expect, it } from 'vitest';
import { resolveUploadNoticeAction } from '../js/upload-performance.js';
import { readRepoFile } from './source-helpers.js';

// 운동영상은 전송 전에 폰에서 재인코딩한다. 그동안은 "영상을 줄이는 중… N%" 가 계속
// 올라오다가, 압축이 끝나는 순간 문구가 뚝 끊기고 퍼센트 0 만 남는다.
// 거기서 "몇 초째" 안내를 다시 걸지 않으면 화면은 '업로드 준비 중 0%' 로 몇 분을 서 있고,
// 그건 실패한 화면과 구분되지 않는다 — 제보가 "계속 지연되고 안되요" 로 오는 이유다.
describe('the "still moving" notice comes back when the app runs out of things to say', () => {
    it('does not count seconds while the percentage is climbing', () => {
        expect(resolveUploadNoticeAction({ progress: 12, message: '' }))
            .toEqual({ ticker: 'cancel', render: true });
    });

    it('does not count seconds while there is something to say', () => {
        expect(resolveUploadNoticeAction({ progress: 0, message: '영상을 줄이는 중… 40%' }))
            .toEqual({ ticker: 'cancel', render: true });
        expect(resolveUploadNoticeAction({ progress: 0, message: '앞에 1개 기다리는 중' }))
            .toEqual({ ticker: 'cancel', render: true });
    });

    it('starts counting again the moment the talking stops', () => {
        // 압축이 끝난 직후: 퍼센트 0, 할 말 없음.
        expect(resolveUploadNoticeAction({ progress: 0, message: '' }))
            .toEqual({ ticker: 'arm', render: true });
    });

    it('does not paint over the counter with a bare 0%', () => {
        // 이미 초를 세고 있는데 0% 이벤트가 오면 그 문구를 덮지 않는다.
        // 덮으면 '업로드 준비 중' 과 'N초째' 가 번갈아 나타나 화면만 흔들린다.
        expect(resolveUploadNoticeAction({ progress: 0, message: '', ticking: true }))
            .toEqual({ ticker: 'arm', render: false });
    });

    it('treats a blank-looking message as nothing said', () => {
        expect(resolveUploadNoticeAction({ progress: 0, message: '   ' }).ticker).toBe('arm');
        expect(resolveUploadNoticeAction({}).ticker).toBe('arm');
    });

    // 실제 순서대로 한 번 돌려본다. 규칙 하나하나가 맞아도 순서가 틀리면 소용없다.
    it('walks a real exercise-video upload: compress, go quiet, then count', () => {
        const events = [
            { progress: 0, message: '영상을 줄이는 중… 5%' },
            { progress: 0, message: '영상을 줄이는 중… 60%' },
            { progress: 0, message: '' },   // 압축 끝, 전송 시작 — 여기서 다시 걸려야 한다
            { progress: 0, message: '' },   // 첫 청크가 아직 안 올라감
            { progress: 3, message: '' }    // 마침내 퍼센트가 움직인다
        ];

        let ticking = false;
        const decisions = events.map((e) => {
            const action = resolveUploadNoticeAction({ ...e, ticking });
            // 걸린 타이머는 8초 뒤 첫 tick 에서 ticking 이 된다.
            if (action.ticker === 'arm') ticking = true;
            else ticking = false;
            return action.ticker;
        });

        expect(decisions).toEqual(['cancel', 'cancel', 'arm', 'arm', 'cancel']);
    });
});

describe('the upload progress path actually uses that rule', () => {
    const APP = readRepoFile('js/app-core.js');

    it('asks before killing or re-arming the counter', () => {
        const fn = APP.split('function updatePendingUploadProgress(inputId, progressPayload) {')[1]
            .split('\n}\n')[0];
        expect(fn).toContain('resolveUploadNoticeAction({');
        expect(fn).toContain("if (notice.ticker === 'cancel') {");
        expect(fn).toContain('schedulePendingUploadStalledNotice(inputId, entry);');
        expect(fn).toContain('if (!notice.render) return;');
    });

    it('imports it rather than re-deriving the rule', () => {
        expect(APP).toContain('resolveUploadNoticeAction } from \'./upload-performance.js');
    });
});
